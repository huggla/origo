import { Feature as olFeature, Collection as olCollection, Overlay as olOverlay } from 'ol';
import * as olGeom from 'ol/geom';
import { fromCircle, fromExtent } from 'ol/geom/Polygon';
import * as olInteraction from 'ol/interaction';
import { createBox } from 'ol/interaction/Draw';
import * as olLayer from 'ol/layer';
import * as olSource from 'ol/source';
import * as olStyle from 'ol/style';
import * as olFormat from 'ol/format';
import * as ui from './src/ui';
import Viewer from './src/viewer';
import loadResources from './src/loadresources';
import titleCase from './src/utils/titlecase';
import * as origoControls from './src/controls';
import * as origoExtensions from './src/extensions';
import supports from './src/utils/supports';
import renderError from './src/utils/rendererror';
import Style from './src/style';
import featurelayer from './src/featurelayer';
import getFeatureInfo from './src/getfeatureinfo';
import getFeature from './src/getfeature';
import * as Utils from './src/utils';
import dropdown from './src/dropdown';
import { renderSvgIcon } from './src/utils/legendmaker';
import SelectedItem from './src/models/SelectedItem';
import 'elm-pep';
import 'pepjs';
import 'drag-drop-touch';
import permalink from './src/permalink/permalink';
import * as Loader from './src/loading';
import Spinner from './src/utils/spinner';

console.log('ORIGO.JS LOADED – DEBUG MODE ON');

const Origo = function Origo(config, options = {}) {
  console.log('Origo: Constructor called with config:', config, 'options:', options);

  let origo;
  let viewer;
  const origoConfig = {
    controls: [],
    featureinfoOptions: {},
    crossDomain: true,
    target: '#app-wrapper',
    keyboardEventTarget: document,
    svgSpritePath: 'css/svg/',
    svgSprites: ['fa-icons.svg', 'material-icons.svg', 'miscellaneous.svg', 'origo-icons.svg', 'custom.svg'],
    breakPoints: {
      xs: [240, 320],
      s: [320, 320],
      m: [500, 500],
      l: [768, 500]
    },
    breakPointsPrefix: 'o-media',
    defaultControls: [
      { name: 'scaleline' },
      { name: 'zoom' },
      { name: 'rotate' },
      { name: 'attribution' },
      { name: 'fullscreen' }
    ]
  };

  const isSupported = supports();
  const targetSelector = options.target || origoConfig.target;
  const targetEl = document.querySelector(targetSelector);

  console.log('Origo: targetSelector:', targetSelector);
  console.log('Origo: targetEl:', targetEl);

  if (!isSupported) {
    console.error('Origo: Browser not supported');
    renderError('browser', targetSelector);
    return null;
  }

  if (!targetEl) {
    console.error(`Origo: Target element NOT FOUND: ${targetSelector}`);
    renderError('target', targetSelector);
    return null;
  }

  const initControls = (controlDefs = []) => {
    console.log('Origo: initControls() – controlDefs:', controlDefs);
    const controls = [];
    (Array.isArray(controlDefs) ? controlDefs : []).forEach(def => {
      if (def && typeof def === 'object' && 'name' in def) {
        const controlName = titleCase(def.name);
        const controlOptions = def.options || {};
        console.log(`Origo: Initializing control: ${controlName}`);
        if (controlName in origoControls) {
          const control = origoControls[controlName](controlOptions);
          control.options = Object.assign(control.options || {}, controlOptions);
          controls.push(control);
        } else {
          console.warn(`Origo: Control not found: ${controlName}`);
        }
      }
    });
    return controls;
  };

  const initExtensions = (extensionDefs = []) => {
    console.log('Origo: initExtensions() – extensionDefs:', extensionDefs);
    const extensions = [];
    (Array.isArray(extensionDefs) ? extensionDefs : []).forEach(def => {
      if (def && typeof def === 'object' && 'name' in def) {
        const extensionName = titleCase(def.name);
        const extensionOptions = def.options || {};
        console.log(`Origo: Initializing extension: ${extensionName}`);
        if (extensionName in origoExtensions) {
          const extension = origoExtensions[extensionName](extensionOptions);
          extensions.push(extension);
        } else {
          console.warn(`Origo: Extension not found: ${extensionName}`);
        }
      }
    });
    return extensions;
  };

  const api = () => viewer;
  const getConfig = () => origoConfig;
  api.controls = () => origoControls;
  api.extensions = () => origoExtensions;

  const initViewer = () => {
    console.log('Origo: initViewer() STARTED');
    const defaultConfig = Object.assign({}, origoConfig, options);
    console.log('Origo: defaultConfig:', defaultConfig);

    let configPromise;

    if (typeof config === 'string') {
      console.log('Origo: Loading external config from:', config);
      configPromise = loadResources(config, defaultConfig);
    } else if (typeof config === 'object' && config !== null) {
      console.log('Origo: Using inline config');
      configPromise = Promise.resolve({ options: config });
    } else {
      console.error('Origo: Invalid config type:', typeof config);
      configPromise = Promise.reject(new Error('Invalid config'));
    }

    configPromise
      .then(data => {
        console.log('Origo: configPromise RESOLVED');
        console.log('Origo: data:', data);
        console.log('Origo: data.options:', data?.options);

        const viewerOptions = data?.options || {};
        console.log('Origo: viewerOptions (raw):', viewerOptions);

        // SÄKRA VANLIGA FÄLT
        viewerOptions.controls = Array.isArray(viewerOptions.controls) ? viewerOptions.controls : [];
        viewerOptions.extensions = Array.isArray(viewerOptions.extensions) ? viewerOptions.extensions : [];
        viewerOptions.layers = Array.isArray(viewerOptions.layers) ? viewerOptions.layers : [];
        viewerOptions.map = viewerOptions.map || {};
        viewerOptions.projection = viewerOptions.projection || {};
        viewerOptions.featureinfoOptions = viewerOptions.featureinfoOptions || {};
        viewerOptions.pageSettings = viewerOptions.pageSettings || {};

        // SÄKRA saveOnServerServiceEndPoint
        const saveEndpoint = viewerOptions.saveOnServerServiceEndPoint || null;
        console.log('Origo: saveOnServerServiceEndPoint:', saveEndpoint);

        console.log('Origo: Final viewerOptions (secured):', viewerOptions);

        // LÅT Viewer hantera target själv
        console.log('Origo: Creating Viewer with target:', targetSelector);
        viewer = Viewer(targetSelector, viewerOptions);

        viewer.on('loaded', () => {
          console.log('Origo: Viewer LOADED event received');

          const urlParams = new URLSearchParams(window.location.search);
          const mapStateId = urlParams.get('mapStateId');
          console.log('Origo: URL params:', Object.fromEntries(urlParams));
          console.log('Origo: mapStateId:', mapStateId);

          // SÄKER HANTERING AV mapStateId
          if (mapStateId && saveEndpoint && typeof permalink.readStateFromServer === 'function') {
            console.log('Origo: Fetching map state from server...');
            permalink.readStateFromServer(mapStateId)
              .then(rawState => {
                console.log('Origo: rawState from server:', rawState);
                if (rawState && typeof rawState === 'object') {
                  const hash = Object.entries(rawState)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
                    .join('&');
                  const hashUrl = `#${hash}`;
                  console.log('Origo: Generated hash URL:', hashUrl);
                  const state = permalink.parsePermalink(hashUrl);
                  console.log('Origo: Parsed state:', state);
                  if (state) {
                    console.log('Origo: Dispatching changestate');
                    viewer.dispatch('changestate', state);
                  }
                }
              })
              .catch(err => {
                console.warn('Origo: Failed to load mapStateId:', err);
              });
          } else if (mapStateId) {
            console.warn('Origo: mapStateId in URL but no saveOnServerServiceEndPoint – ignoring');
          } else {
            console.log('Origo: No mapStateId in URL');
          }

          console.log('Origo: Dispatching global load event');
          origo.dispatch('load', viewer);
        });
      })
      .catch(err => {
        console.error('Origo: configPromise REJECTED');
        console.error('Origo: Error:', err);
        renderError('config', targetSelector);
      });
  };

  window.addEventListener('hashchange', (ev) => {
    console.log('Origo: hashchange detected:', ev.newURL);
    const newParams = permalink.parsePermalink(ev.newURL);
    if (newParams && newParams.map) {
      console.log('Origo: Re-initializing viewer due to hashchange');
      initViewer();
    }
  });

  return ui.Component({
    api,
    getConfig,
    onInit() {
      console.log('Origo: Component onInit()');
      const base = document.createElement('base');
      base.href = (options.baseUrl || origoConfig.baseUrl || '/');
      document.head.appendChild(base);
      origo = this;
      initViewer();
    }
  });
};

// --- OpenLayers helpers ---
olInteraction.Draw.createBox = createBox;
olGeom.Polygon.fromCircle = fromCircle;
olGeom.Polygon.fromExtent = fromExtent;

// --- Exportera globalt ---
Origo.controls = origoControls;
Origo.extensions = origoExtensions;
Origo.ui = ui;
Origo.Style = Style;
Origo.featurelayer = featurelayer;
Origo.getFeatureInfo = getFeatureInfo;
Origo.getFeature = getFeature;
Origo.ol = [];
Origo.ol.geom = olGeom;
Origo.ol.interaction = olInteraction;
Origo.ol.layer = olLayer;
Origo.ol.source = olSource;
Origo.ol.style = olStyle;
Origo.ol.Feature = olFeature;
Origo.ol.Collection = olCollection;
Origo.ol.Overlay = olOverlay;
Origo.ol.format = olFormat;
Origo.Utils = Utils;
Origo.dropdown = dropdown;
Origo.renderSvgIcon = renderSvgIcon;
Origo.SelectedItem = SelectedItem;
Origo.Loader = {};
Origo.Loader.show = Loader.showLoading;
Origo.Loader.hide = Loader.hideLoading;
Origo.Loader.withLoading = Loader.withLoading;
Origo.Loader.getInlineSpinner = Spinner;

export default Origo;

// Global export
if (typeof window !== 'undefined') {
  window.Origo = Origo;
  console.log('Origo: Exported to window.Origo');
}
