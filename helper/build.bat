@echo off
setlocal
cd /d "%~dp0"
echo Compiling VeoFlowHelper.exe (64-bit Windows)...
if not exist "bin" mkdir bin

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set REFS=/r:System.dll,System.Windows.Forms.dll,System.Drawing.dll,UIAutomationClient.dll,UIAutomationTypes.dll,WindowsBase.dll
set LIB_WPF=/lib:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF

%CSC% /nologo /optimize+ /platform:x64 /target:exe /out:bin\VeoFlowHelper.exe %LIB_WPF% %REFS% src\NativeMethods.cs src\Protocol.cs src\KeyboardHook.cs src\UIAutomationReader.cs src\WindowContext.cs src\TextInjector.cs src\Program.cs

if %errorlevel% equ 0 (
    echo Compilation succeeded: bin\VeoFlowHelper.exe
    exit /b 0
) else (
    echo Compilation failed!
    exit /b 1
)
