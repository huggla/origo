import urlparser from '../utils/urlparser';
import permalinkStore from './permalinkstore';
import permalinkParser from './permalinkparser';

const permalink = {};

// --- NY FUNKTION: serializeState – används av både getHash och origo.js ---
const serializeState = (state, viewer) => {
  const serialized = {};

  // Center: [x, y] → "x,y" (avrundat)
  if (state.center) {
    serialized.center = Array.isArray(state.center)
      ? state.center.map(coord => Math.round(coord)).join(',')
      : state.center;
  }

  // Zoom: number → string
  if (state.zoom !== undefined) {
    serialized.zoom = String(state.zoom);
  }

  // Layers: objekt → "layer1,v=1,s=1;layer2,v=0"
  if (state.layers && viewer) {
    const layers = viewer.getLayers();
    const layerMap = {};
    layers.forEach(l => { layerMap[l.get('name')] = l; });

    const saveLayers = [];
    Object.keys(state.layers).forEach(name => {
      const layerState = state.layers[name];
      const layer = layerMap[name];
      if (layer && layerState) {
        const saveLayer = { name };
        if (layerState.visible !== undefined) saveLayer.v = layerState.visible ? 1 : 0;
        if (layerState.legend !== undefined) saveLayer.s = layerState.legend ? 1 : 0;
        if (layerState.opacity !== undefined) saveLayer.o = Math.round(layerState.opacity * 100);
        if (layerState.altStyleIndex !== undefined) saveLayer.sn = layerState.altStyleIndex;
        if (layerState.activeThemes) saveLayer.th = layerState.activeThemes.join('~');
        saveLayers.push(saveLayer);
      }
    });

    // ANVÄND urlparser.stringify – exakt samma som permalinkStore.getSaveLayers
    serialized.layers = saveLayers
      .map(layer => urlparser.stringify(layer, { topmost: 'name' }))
      .join(',');
  }

  // Legend: array → "expanded,visibleLayersViewActive"
  if (state.legend) {
    serialized.legend = Array.isArray(state.legend)
      ? state.legend.join(',')
      : state.legend;
  }

  // Pin: [x, y] → "x,y"
  if (state.pin) {
    serialized.pin = Array.isArray(state.pin)
      ? state.pin.map(coord => Math.round(coord)).join(',')
      : state.pin;
  }

  // Feature, map
  if (state.feature) serialized.feature = state.feature;
  if (state.map) serialized.map = state.map;

  // Controls: JSON-sträng
  if (state.controls) {
    Object.keys(state.controls).forEach(key => {
      serialized[`controls.${key}`] = JSON.stringify(state.controls[key]);
    });
  }

  return serialized;
};

// --- UPPDATERAD getHash – använder serializeState ---
const getHash = (viewer, isExtended = false) => {
  const state = permalinkStore.getState(viewer, isExtended);
  const serialized = serializeState(state, viewer);
  return urlparser.formatUrl(serialized);
};

// --- parsePermalink – oförändrad ---
const parsePermalink = (url) => {
  const hash = url.split('#')[1] || '';
  if (!hash) return null;

  const params = hash.split('&').reduce((acc, param) => {
    const [key, value] = param.split('=');
    if (value !== undefined) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});

  const parsed = {};
  Object.keys(params).forEach(key => {
    if (permalinkParser[key]) {
      parsed[key] = permalinkParser[key](params[key]);
    } else if (key.startsWith('controls.')) {
      const controlKey = key.replace('controls.', '');
      if (!parsed.controls) parsed.controls = {};
      try {
        parsed.controls[controlKey] = JSON.parse(params[key]);
      } catch (e) {
        parsed.controls[controlKey] = params[key];
      }
    } else {
      parsed[key] = params[key];
    }
  });

  return parsed;
};

// --- readStateFromServer – oförändrad ---
const readStateFromServer = (mapStateId) => {
  return fetch(`${permalinkStore.getUrl()}?mapStateId=${mapStateId}`)
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch map state');
      return response.json();
    })
    .then(data => {
      const mapObj = {};
      Object.keys(data).forEach(key => {
        if (permalinkParser[key]) {
          mapObj[key] = permalinkParser[key](data[key]);
        } else {
          mapObj[key] = data[key];
        }
      });
      return mapObj;
    });
};

// --- Exportera allt ---
export default {
  getHash,
  parsePermalink,
  readStateFromServer,
  serializeState, // NYTT – används av origo.js
  getUrl: permalinkStore.getUrl,
  AddExternalParams: permalinkStore.AddExternalParams
};
