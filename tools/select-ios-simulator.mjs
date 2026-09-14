import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const versionParts = value => /^\d+\.\d+(?:\.\d+)?$/.test(value ?? '')
  ? value.split('.').map(Number) : null;

export function selectIOSSimulator(inventory, sdkVersion) {
  const sdk = versionParts(sdkVersion);
  if (!sdk) throw new Error(`Invalid active iPhone Simulator SDK version: ${sdkVersion}`);
  const candidates = [];
  for (const runtime of inventory.runtimes ?? []) {
    const version = versionParts(runtime.version);
    if (!runtime.isAvailable || !runtime.identifier.startsWith('com.apple.CoreSimulator.SimRuntime.iOS-') || !version) continue;
    for (const device of inventory.devices?.[runtime.identifier] ?? []) {
      if (device.isAvailable !== true || device.name !== 'iPhone SE (3rd generation)') continue;
      candidates.push({ udid: device.udid, platformVersion: runtime.version,
        runtime: runtime.identifier, state: device.state, version });
    }
  }
  const matching = candidates.filter(c => c.version[0] === sdk[0] && c.version[1] === sdk[1]);
  matching.sort((a, b) => (b.version[2] ?? 0) - (a.version[2] ?? 0)
    || Number(b.state === 'Booted') - Number(a.state === 'Booted') || a.udid.localeCompare(b.udid));
  if (!matching.length) throw new Error(`No available iPhone SE 3 runtime matches active SDK ${sdkVersion}; available: ${candidates.map(c => c.platformVersion).join(', ') || 'none'}`);
  const { version, ...device } = matching[0];
  return { sdkVersion, ...device, policy: 'Available iPhone SE 3 on the active simulator SDK major/minor; highest patch, then already booted, then UDID.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sdkVersion, inventoryPath, recordPath] = process.argv.slice(2);
  if (!inventoryPath || !recordPath) throw new Error('Usage: select-ios-simulator.mjs SDK_VERSION INVENTORY_JSON SELECTION_JSON');
  const selected = selectIOSSimulator(JSON.parse(readFileSync(inventoryPath, 'utf8')), sdkVersion);
  writeFileSync(recordPath, JSON.stringify(selected, null, 2) + '\n');
  process.stdout.write(`${selected.udid}\t${selected.platformVersion}\n`);
}
