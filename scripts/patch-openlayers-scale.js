const fs = require('fs');
const path = require('path');

const scaleLinePath = path.join(__dirname, '..', 'node_modules', 'ol', 'control', 'ScaleLine.js');
const source = fs.readFileSync(scaleLinePath, 'utf8');
const scaleMethod = /^ {2}getScaleForResolution\(\) \{\r?\n[\s\S]*?^ {2}\}/m;
const match = source.match(scaleMethod);

if (!match) {
  throw new Error('OpenLayers ScaleLine.getScaleForResolution() was not found');
}

const alreadyPatched = /getScaleForResolution\(\)\s*\{\s*return this\.viewState_\.resolution \* \(1000 \/ 25\.4\) \* \(this\.dpi_ \|\| DEFAULT_DPI\);\s*\}/;

if (!alreadyPatched.test(match[0])) {
  if (!match[0].includes('return resolution * inchesPerMeter * dpi;')) {
    throw new Error('OpenLayers ScaleLine.getScaleForResolution() has an unexpected implementation');
  }

  const replacement = [
    '  getScaleForResolution() {',
    '    return this.viewState_.resolution * (1000 / 25.4) * (this.dpi_ || DEFAULT_DPI);',
    '  }'
  ].join('\n');

  fs.writeFileSync(scaleLinePath, source.replace(match[0], replacement));
}
