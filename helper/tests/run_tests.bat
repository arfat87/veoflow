@echo off
setlocal
cd /d "%~dp0"
echo Compiling and running Native Helper Tests...

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set REFS=/r:System.dll,System.Windows.Forms.dll,System.Drawing.dll,UIAutomationClient.dll,UIAutomationTypes.dll,WindowsBase.dll
set LIB_WPF=/lib:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF

%CSC% /nologo /optimize+ /platform:x64 /target:exe /out:HelperTests.exe %LIB_WPF% %REFS% ..\src\NativeMethods.cs ..\src\Protocol.cs ..\src\KeyboardHook.cs ..\src\UIAutomationReader.cs ..\src\WindowContext.cs ..\src\TextInjector.cs HelperProtocolTests.cs TestRunner.cs

if %errorlevel% neq 0 (
    echo Compilation of HelperTests failed!
    exit /b 1
)

HelperTests.exe
set TEST_STATUS=%errorlevel%
if exist "HelperTests.exe" del HelperTests.exe
exit /b %TEST_STATUS%

