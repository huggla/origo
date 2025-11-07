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

const Origo = function Origo(config, options = {}) {
  /** Reference to the returned Component */
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

  // --- Kontrollera browser-stöd ---
  const isSupported = supports();
  const targetSelector = options.target || origoConfig.target;
  const targetEl = document.querySelector(targetSelector);

  if (!isSupported) {
    renderError('browser', targetSelector);
    return null;
  }

  if (!targetEl) {
    console.error(`Target element not found: ${targetSelector}`);
    renderError('target', targetSelector);
    return null;
  }

  // --- Init controls ---
  const initControls = (controlDefs) => {
    const controls = [];
    controlDefs.forEach((def) => {
      if ('name' in def) {
        const controlName = titleCase(def.name);
        const controlOptions = def.options || {};
        if (controlName in origoControls) {
          const control = origoControls[controlName](controlOptions);
          control.options = Object.assign(control.options || {}, controlOptions);
          controls.push(control);
        }
      }
    });
    return controls;
  };

  // --- Init extensions ---
  const initExtensions = (extensionDefs) => {
    const extensions = [];
    extensionDefs.forEach((def) => {
      if ('name' in def) {
        const extensionName = titleCase(def.name);
        const extensionOptions = def.options || {};
        if (extensionName in origoExtensions) {
          const extension = origoExtensions[extensionName](extensionOptions);
          extensions.push(extension);
        }
      }
    });
    return extensions;
  };

  // --- API ---
  const api = () => viewer;
  const getConfig = () => origoConfig;
  api.controls = () => origoControls;
  api.extensions = () => origoExtensions;

  // --- initViewer – Huvudfunktion ---
  const initViewer = () => {
    const defaultConfig = Object.assign({}, origoConfig, options);

    // HANTERA INLINE ELLER EXTERN CONFIG
    const configPromise = typeof config === 'object' && config !== null
      ? Promise.resolve({ options: config })
      : loadResources(config, defaultConfig);

    configPromise
      .then((data) => {
        const viewerOptions = data.options;
        viewerOptions.target = targetSelector;
        viewerOptions.controls = initControls(viewerOptions.controls);
        viewerOptions.extensions = initExtensions(viewerOptions.extensions || []);

        viewer = Viewer(targetSelector, viewerOptions);

        viewer.on('loaded', () => {
          // --- HANTERA ?mapStateId= ---
          const urlParams = new URLSearchParams(window.location.search);
          const mapStateId = urlParams.get('mapStateId');

          if (mapStateId) {
            permalink.readStateFromServer(mapStateId)
              .then(rawState => {
                if (rawState && typeof rawState === 'object' && Object.keys(rawState).length > 0) {
                  try {
                    // BYGG HASH MANUELT – säker mot null/undefined
                    const hashParts = [];
                    Object.keys(rawState).forEach(key => {
                      const value = rawState[key];
                      if (value !== null && value !== undefined && value !== '') {
                        hashParts.push(`${key}=${encodeURIComponent(value)}`);
                      }
                    });
                    const hashStr = hashParts.join('&');
                    const hashUrl = `#${hashStr}`;

                    const parsedState = permalink.parsePermalink(hashUrl);
                    if (parsedState) {
                      viewer.dispatch('changestate', parsedState);
                      console.log('MapState återställt från ?mapStateId=', mapStateId);
                    }
                  } catch (err) {
                    console.error('Kunde inte parsa mapstate:', err);
                  }
                } else {
                  console.warn('Inget giltigt mapstate från servern');
                }
              })
              .catch(err => {
                console.error('Kunde inte hämta mapstate:', err);
              });
          }

          // Trigga load för extensions
          origo.dispatch('load', viewer);
        });
      })
      .catch(error => {
        console.error('Kunde inte ladda config:', error);
        renderError('config', targetSelector);
      });
  };

  // --- HANTERA HASHCHANGE ---
  window.addEventListener('hashchange', (ev) => {
    const newParams = permalink.parsePermalink(ev.newURL);
    if (newParams && newParams.map) {
      initViewer();
    }
  });

  // --- Returnera UI-komponent ---
  return ui.Component({
    api,
    getConfig,
    onInit() {
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
