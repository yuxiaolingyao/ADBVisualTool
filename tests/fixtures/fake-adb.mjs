const args = process.argv.slice(2)

if (args[0] === 'version') {
  console.log('Android Debug Bridge version 1.0.41')
  console.log('Version 35.0.2-fake')
  process.exit(0)
}

if (args[0] === 'start-server' || args[0] === 'kill-server') {
  process.exit(0)
}

if (args[0] === 'devices') {
  console.log('List of devices attached')
  console.log('FAKE123456\tdevice product:test_device model:Pixel_7 device:panther transport_id:1')
  process.exit(0)
}

if (args.includes('shell')) {
  const shellIndex = args.indexOf('shell')
  const command = args.slice(shellIndex + 1).join(' ')

  if (command === 'getprop') {
    console.log('[ro.product.brand]: [TestBrand]')
    console.log('[ro.product.manufacturer]: [TestManufacturer]')
    console.log('[ro.product.model]: [Pixel 7]')
    console.log('[ro.build.version.release]: [14]')
    console.log('[ro.build.version.sdk]: [34]')
    console.log('[ro.build.fingerprint]: [TestBrand/panther/panther:14/UP1A/1:user/release-keys]')
    process.exit(0)
  }

  if (command.includes('dumpsys window')) {
    console.log('  mCurrentFocus=Window{abc123 u0 com.android.settings/com.android.settings.Settings}')
    process.exit(0)
  }

  if (command.includes('dumpsys activity')) {
    process.exit(0)
  }
}

process.exit(0)
