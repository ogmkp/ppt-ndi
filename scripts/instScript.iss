
#define MyAppName "PPT NDI"
#define MyAppVersion "1.0.5"
#define MyAppPublisher "ykhwong"
#define MyAppURL "https://github.com/ykhwong/ppt-ndi"
#define MyAppExeName "ppt-ndi.exe"
#define MyAppHome "<!-- USERPROFILE PLACEHOLDER -->\ppt_ndi"

[Setup]
AppId={{B4CE62CD-7E10-4739-A22B-A44B75D2A087}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
LicenseFile={#MyAppHome}\ppt-ndi\LICENSE
InfoBeforeFile={#MyAppHome}\ppt-ndi\scripts\InstIntro.txt
OutputDir={#MyAppHome}
OutputBaseFilename=pptndi_setup
SetupIconFile={#MyAppHome}\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
PrivilegesRequiredOverridesAllowed=commandline

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#MyAppHome}\ppt-ndi-win32-x64\ppt-ndi.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#MyAppHome}\ppt-ndi-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{userappdata}\PPT-NDI";
Name: "{commonappdata}\PPT-NDI\temp"; Permissions: everyone-full

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autoprograms}\{#MyAppName} (SlideShow Mode)"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Parameters: "--slideshow"
Name: "{autoprograms}\{#MyAppName} (Classic Mode)"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Parameters: "--classic"
Name: "{autoprograms}\Uninstall PPT NDI"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
