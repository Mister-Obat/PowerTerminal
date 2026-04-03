Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c start-dev.bat", 0
Set WshShell = Nothing
