# Gitleaks Setup

If Gitleaks is not installed, grab the latest release:

**Windows:**
```powershell
# Visit https://github.com/gitleaks/gitleaks/releases for the latest version
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_<VERSION>_windows_x64.zip -o /tmp/gitleaks.zip
Expand-Archive -Path /tmp/gitleaks.zip -DestinationPath /tmp
```

**Linux/macOS:**
```bash
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_<VERSION>_linux_x64.tar.gz -o /tmp/gitleaks.tar.gz
tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks
chmod +x /tmp/gitleaks
```