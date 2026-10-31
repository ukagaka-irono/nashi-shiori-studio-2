# なしスタジオ - 単体 exe をビルドする
#
#   .\build.ps1              64bit の nashi-studio-2.exe を作る
#   .\build.ps1 -Arch x86    32bit 版
#
[CmdletBinding()]
param(
    [ValidateSet('x86', 'x64')]
    [string]$Arch = 'x64',
    [switch]$Clean,
    # 書き出しの中身を見るコンソール（studio\test\export_host.cpp）も作る
    [switch]$Test,
    # コード署名証明書の拇印。指定すると exe に署名する
    # （スマートアプリコントロール対策。公的CAの証明書でないと効果は薄い）
    [string]$SignThumbprint
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root
$src = Join-Path $root 'src'
$obj = Join-Path $root ('obj\' + $Arch)
$exeOut = Join-Path $repo 'nashi-studio-2.exe'

if ($Clean -and (Test-Path $obj)) { Remove-Item -Recurse -Force $obj }
New-Item -ItemType Directory -Force -Path $obj | Out-Null

# ---- MSVC 環境 -------------------------------------------------------------
function Import-VcVars([string]$targetArch) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $vsPath = $null
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    }
    if (-not $vsPath) {
        $guess = Get-ChildItem "$env:ProgramFiles\Microsoft Visual Studio" -Directory -ErrorAction SilentlyContinue |
                 Sort-Object Name -Descending | Select-Object -First 1
        if ($guess) { $vsPath = (Get-ChildItem $guess.FullName -Directory | Select-Object -First 1).FullName }
    }
    if (-not $vsPath) { throw 'Visual Studio (C++ ビルドツール) が見つかりませんでした。' }
    $bat = Join-Path $vsPath 'VC\Auxiliary\Build\vcvarsall.bat'
    if (-not (Test-Path $bat)) { throw "vcvarsall.bat が見つかりません: $bat" }
    $lines = cmd /c "`"$bat`" $targetArch >nul 2>&1 && set"
    foreach ($line in $lines) {
        if ($line -match '^([^=]+)=(.*)$') {
            Set-Item -Path ("Env:" + $matches[1]) -Value $matches[2] -ErrorAction SilentlyContinue
        }
    }
}

$needVcVars = $true
$cl = Get-Command cl -ErrorAction SilentlyContinue
if ($cl -and $env:LIB) {
    $isX64Env = $cl.Source -match '\\Hostx64\\x64\\' -or $env:VSCMD_ARG_TGT_ARCH -eq 'x64'
    if (($Arch -eq 'x64') -eq [bool]$isX64Env) { $needVcVars = $false }
}
if ($needVcVars) {
    Write-Host "[studio] MSVC 環境を読み込みます ($Arch)..." -ForegroundColor DarkGray
    Import-VcVars $Arch
}

# ---- exe を 1 つ作る -------------------------------------------------------
# コンパイルとリンクの中身は 3 つとも同じなので、ここにまとめます。
# ここを通さずに cl / link を直に書くと、テスト用の exe を増やすたびに
# 同じ 30 行がまた増えていきます。
function Build-Exe {
    param(
        [Parameter(Mandatory)][string]$Label,     # 画面に出す名前
        [Parameter(Mandatory)][string]$Out,       # できあがる exe
        [Parameter(Mandatory)][string]$ObjDir,    # .obj の置き場
        [Parameter(Mandatory)][string[]]$Sources,
        [string[]]$Include = @(),                 # /I に渡すところ
        [string[]]$Define  = @(),                 # /D に渡すもの（共通ぶんは下に書いてあります）
        [string]$Subsystem = 'CONSOLE',
        [string[]]$Extra   = @(),                 # .res や .lib など、obj のあとに並べるもの
        [string[]]$Lib     = @()
    )
    New-Item -ItemType Directory -Force -Path $ObjDir | Out-Null

    Write-Host "[studio] $Label をコンパイル中..." -ForegroundColor Cyan
    $clArgs = @('/nologo', '/c', '/O2', '/MT', '/EHsc', '/W3', '/GS', '/std:c++17', '/utf-8',
                '/DNDEBUG', '/DWIN32', '/DUNICODE', '/D_UNICODE', '/D_CRT_SECURE_NO_WARNINGS') +
              ($Define  | ForEach-Object { "/D$_" }) +
              ($Include | ForEach-Object { "/I$_" }) +
              @("/Fo:$ObjDir\") + $Sources
    & cl @clArgs
    if ($LASTEXITCODE -ne 0) { throw "$Label のコンパイルに失敗しました。" }

    # 前のビルドで残った .obj を混ぜないよう、今回のソースから直接 obj 名を作る
    $objs = $Sources | ForEach-Object {
        Join-Path $ObjDir ([System.IO.Path]::GetFileNameWithoutExtension($_) + '.obj')
    }

    Write-Host "[studio] $Label をリンク中..." -ForegroundColor Cyan
    # /DEPENDENTLOADFLAG:0x800 … 輸入している DLL（version.dll など）を System32 からだけ読む。
    #   exe はダウンロードフォルダのような誰でも書ける所に置かれるので、となりに置かれた
    #   同じ名前の DLL を読みこまないようにします（Windows 10 1607 から効きます）。
    $linkArgs = @('/nologo', "/OUT:$Out", "/SUBSYSTEM:$Subsystem", '/OPT:REF', '/OPT:ICF',
                  '/DEPENDENTLOADFLAG:0x800') +
                $objs + $Extra + $Lib
    & link @linkArgs
    if ($LASTEXITCODE -ne 0) { throw "$Label のリンクに失敗しました。" }

    $kb = [math]::Round((Get-Item $Out).Length / 1KB, 1)
    Write-Host "[studio] OK -> $Out ($kb KB)" -ForegroundColor Green
}

# どの exe でも使う Windows のライブラリ。足りないぶんは呼ぶ側で足します。
$libsCommon = @('kernel32.lib', 'user32.lib', 'shell32.lib', 'shlwapi.lib',
                'advapi32.lib', 'ole32.lib')

# ---- 埋め込みリソースを作る ------------------------------------------------
$dll = Join-Path $repo 'shiori\dist\nashi.dll'
$sample = Join-Path $root 'res\sample-project.json'

$versionFile = Join-Path $repo 'VERSION'
$version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { '0.0.0' }

Write-Host "[studio] リソースを準備中... (v$version)" -ForegroundColor Cyan
& (Join-Path $root 'tools\embed.ps1') `
    -Version $version `
    -PublicDir (Join-Path $repo 'ui') `
    -StageDir $obj `
    -DllPath $dll `
    -SamplePath $sample `
    -IconPath (Join-Path $root 'res\nashi.ico')

Push-Location $obj
try {
    # /c65001 … assets.rc を UTF-8 として読ませる（日本語のバージョン情報のため）
    & rc /nologo /c65001 /fo assets.res assets.rc
    if ($LASTEXITCODE -ne 0) { throw 'リソースのコンパイルに失敗しました。' }
} finally {
    Pop-Location
}

# ---- コンパイル ------------------------------------------------------------
$sources = @(
    (Join-Path $src 'main.cpp'),
    (Join-Path $src 'api.cpp'),
    (Join-Path $src 'assets.cpp'),
    (Join-Path $src 'webview.cpp'),
    (Join-Path $src 'webreq.cpp'),
    (Join-Path $src 'sstp.cpp'),
    (Join-Path $src 'exporter.cpp'),
    (Join-Path $src 'image.cpp'),
    (Join-Path $src 'zip.cpp'),
    (Join-Path $src 'deflate.cpp'),
    (Join-Path $src 'fsutil.cpp'),
    (Join-Path $src 'preview.cpp'),
    # 「ためす」は栞そのものでブロックを動かします（同じ規則を二重に書かないため）
    (Join-Path $repo 'shiori\src\interp.cpp'),
    (Join-Path $repo 'shiori\src\program.cpp'),
    (Join-Path $repo 'shiori\src\json.cpp'),
    (Join-Path $repo 'shiori\src\util.cpp')
)

$wv2 = Join-Path $root 'third_party\webview2'
if (-not (Test-Path (Join-Path $wv2 'include\WebView2.h'))) {
    throw "WebView2 SDK が見つかりません: $wv2 (studio\third_party\webview2\README.md を参照)"
}

Build-Exe -Label "なしスタジオ 2 ($Arch)" -Out $exeOut -ObjDir $obj -Sources $sources `
    -Include @($src, "$repo\shiori\src", $obj, "$wv2\include") `
    -Define '_WINDOWS' -Subsystem 'WINDOWS' `
    -Extra @((Join-Path $obj 'assets.res'), (Join-Path $wv2 "$Arch\WebView2LoaderStatic.lib")) `
    -Lib ($libsCommon + @('gdi32.lib', 'comdlg32.lib', 'oleaut32.lib', 'version.lib', 'ws2_32.lib'))

# ---- テスト用コンソール ----------------------------------------------------
# 画面を出さずに中身を見るためのもの。
#   export_host  … 書き出されるファイル（surfaces.txt など）
#   preview_host … 「ためす」の結果（一致テストが 32bit の栞と見くらべます）
if ($Test) {
    Build-Exe -Label '書き出しテスト用コンソール' `
        -Out (Join-Path $root 'test\export_host.exe') -ObjDir (Join-Path $obj 'test') `
        -Sources @(
            (Join-Path $root 'test\export_host.cpp'),
            (Join-Path $src 'exporter.cpp'),
            (Join-Path $src 'image.cpp'),
            (Join-Path $src 'zip.cpp'),
            (Join-Path $src 'deflate.cpp'),
            (Join-Path $src 'fsutil.cpp'),
            (Join-Path $repo 'shiori\src\json.cpp'),
            (Join-Path $repo 'shiori\src\util.cpp')
        ) `
        -Include @($src, "$repo\shiori\src") `
        -Lib ($libsCommon + @('gdi32.lib', 'comdlg32.lib', 'oleaut32.lib'))

    Build-Exe -Label 'プレビューテスト用コンソール' `
        -Out (Join-Path $root 'test\preview_host.exe') -ObjDir (Join-Path $obj 'preview') `
        -Sources @(
            (Join-Path $root 'test\preview_host.cpp'),
            (Join-Path $src 'preview.cpp'),
            (Join-Path $repo 'shiori\src\interp.cpp'),
            (Join-Path $repo 'shiori\src\program.cpp'),
            (Join-Path $repo 'shiori\src\json.cpp'),
            (Join-Path $repo 'shiori\src\util.cpp')
        ) `
        -Include @($src, "$repo\shiori\src") `
        -Lib $libsCommon
}

if ($SignThumbprint) {
    $cert = Get-ChildItem "Cert:\CurrentUser\My\$SignThumbprint" -ErrorAction SilentlyContinue
    if (-not $cert) { $cert = Get-ChildItem "Cert:\LocalMachine\My\$SignThumbprint" -ErrorAction SilentlyContinue }
    if (-not $cert) { throw "証明書が見つかりません: $SignThumbprint" }
    $result = Set-AuthenticodeSignature -FilePath $exeOut -Certificate $cert -HashAlgorithm SHA256 `
        -TimestampServer 'http://timestamp.digicert.com'
    Write-Host "[studio] 署名: $($result.Status)" -ForegroundColor DarkGray
}
