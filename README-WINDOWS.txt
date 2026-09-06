LEDGER — SECURE WINDOWS DESKTOP APP
===================================

This version is a native Electron Windows desktop app with:

• Separate user accounts
• Per-account encrypted ledger files
• AES-256-GCM encryption at rest
• PBKDF2-SHA256 password key derivation (210,000 iterations)
• Passwords are not stored; only a verifier is stored
• Encryption keys stay in the Electron main process during a login session
• Renderer has no Node.js filesystem access
• Encrypted backup/export and encrypted restore/import
• Dark/light theme
• Existing Ledger dashboard, calendar, activity, recurring and savings features

DATA LOCATION
-------------
Ledger stores its encrypted files under Electron's per-user application data folder.
Each account has a separate .ledger file. The account list contains usernames and
password-verification metadata, but financial records are encrypted.

BUILD ON WINDOWS
----------------
1. Install Node.js LTS.
2. Open Command Prompt or PowerShell in this folder.
3. Run:

   npm install
   npm run dist

4. The installer will be created in:

   dist\Ledger-Setup-1.0.0.exe

SECURITY NOTES
--------------
• Use a strong, unique password (8+ characters; a longer passphrase is recommended).
• If a password is forgotten, encrypted data cannot be recovered by the app.
• Backups are encrypted and can only be restored after signing into the same account.
• This app is local-first; it does not upload ledger data to a server.
