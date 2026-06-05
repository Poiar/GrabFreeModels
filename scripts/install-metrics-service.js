#!/usr/bin/env node
/**
 * install-metrics-service.js
 * Installs the metrics exporter as a Windows service using nssm (if available) or sc.exe.
 *
 * Usage: node scripts/install-metrics-service.js [--port 9180] [--name GrabFreeModelsMetrics]
 */

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
let port = 9180;
let serviceName = 'GrabFreeModelsMetrics';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i], 10);
  if (args[i] === '--name' && args[i + 1]) serviceName = args[++i];
}

const scriptPath = path.join(__dirname, 'metrics-exporter.js');

// Ensure the exporter script exists
if (!require('fs').existsSync(scriptPath)) {
  console.error(`Metrics exporter script not found at ${scriptPath}`);
  process.exit(1);
}

// Build the command line for the service
const command = `node "${scriptPath}" --port ${port}`;

// Try nssm first (if installed)
const nssmPath = 'C:\\Program Files\\nssm\\win64\\nssm.exe';
if (require('fs').existsSync(nssmPath)) {
  execSync(`"${nssmPath}" install ${serviceName} ${command}`);
  execSync(`"${nssmPath}" set ${serviceName} Start SERVICE_AUTO_START`);
  execSync(`"${nssmPath}" start ${serviceName}`);
  console.log(`Service ${serviceName} installed and started via nssm.`);
} else {
  // Fallback to sc.exe
  const binPath = `cmd.exe /c "${command}"`;
  execSync(`sc.exe create ${serviceName} binPath= "${binPath}" start= auto`);
  execSync(`sc.exe start ${serviceName}`);
  console.log(
    `Service ${serviceName} installed and started via sc.exe. Consider installing nssm for better handling.`,
  );
}
