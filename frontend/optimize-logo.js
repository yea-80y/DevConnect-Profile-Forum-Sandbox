const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'public', 'logo.png');
const outputPath = path.join(__dirname, 'public', 'logo-new.png');

sharp(inputPath)
  .resize(800, 800, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png({ quality: 85, compressionLevel: 9 })
  .toFile(outputPath)
  .then(info => {
    console.log('✓ Logo optimized successfully!');
    console.log('Original size: ~1.8MB');
    console.log(`New size: ${(info.size / 1024).toFixed(0)}KB`);
    console.log(`Dimensions: ${info.width}x${info.height}`);
    console.log('\nTo use the new logo, run:');
    console.log('  mv public/logo-new.png public/logo.png');
  })
  .catch(err => {
    console.error('Error optimizing logo:', err);
    process.exit(1);
  });
