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
import permalinkStore from './src/permalink/permalinkstore';
import * as Loader from './src/loading';
import Spinner from './src/utils/spinner';

const Origo = function Origo(configPath, options = {}) {
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

  const isSupported = supports();
  const el = options.target || origoConfig.target;
  if (!isSupported) {
    renderError('browser', el);
    return null;
  }

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

  const api = () => viewer;
  const getConfig = () => origoConfig;

  api.controls = () => origoControls;
  api.extensions = () => origoExtensions;

  /** Helper that initialises a new viewer  */
viewer.on('loaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const mapStateId = urlParams.get('mapStateId');

  if (mapStateId) {
    permalink.readStateFromServer(mapStateId).then(rawState => {
      if (rawState) {
        // STEG 1: Skapa ett "falskt" state-objekt med strängar
        const serializedState = {};

        // Center: [x,y] → "x,y"
        if (rawState.center) {
          serializedState.center = Array.isArray(rawState.center)
            ? rawState.center.map(coord => Math.round(coord)).join(',')
            : rawState.center;
        }

        // Zoom: number → string
        if (rawState.zoom !== undefined) {
          serializedState.zoom = String(rawState.zoom);
        }

        // Layers: objekt → "layer1,v=1,s=1;layer2,v=0"
        if (rawState.layers) {
          const layers = viewer.getLayers();
          const layerMap = {};
          layers.forEach(l => { layerMap[l.get('name')] = l; });

          const saveLayers = [];
          Object.keys(rawState.layers).forEach(name => {
            const l = layerMap[name];
            const s = rawState.layers[name];
            if (l && s) {
              const saveLayer = { name };
              if (s.visible !== undefined) saveLayer.v = s.visible ? 1 : 0;
              if (s.legend !== undefined) saveLayer.s = s.legend ? 1 : 0;
              if (s.opacity !== undefined) saveLayer.o = Math.round(s.opacity * 100);
              if (s.altStyleIndex !== undefined) saveLayer.sn = s.altStyleIndex;
              if (s.activeThemes) saveLayer.th = s.activeThemes.join('~');
              saveLayers.push(saveLayer);
            }
          });

          // Använd samma serialisering som permalinkStore.getSaveLayers
          serializedState.layers = saveLayers
            .map(layer => Utils.urlparser.stringify(layer, { topmost: 'name' }))
            .join(',');
        }

        // Legend, pin, feature, map – redan sträng
        if (rawState.legend) serializedState.legend = rawState.legend;
        if (rawState.pin) {
          serializedState.pin = Array.isArray(rawState.pin)
            ? rawState.pin.map(Math.round).join(',')
            : rawState.pin;
        }
        if (rawState.feature) serializedState.feature = rawState.feature;
        if (rawState.map) serializedState.map = rawState.map;

        // STEG 2: Använd Utils.urlparser.formatUrl – exakt som Origo gör
        const hashStr = Utils.urlparser.formatUrl(serializedState);
        const hashUrl = `#${hashStr}`;
        const parsedState = permalink.parsePermalink(hashUrl);

        if (parsedState) {
          viewer.dispatch('changestate', parsedState);
          console.log('MapState återställt via Utils.urlparser!');
        }
      }
    }).catch(err => {
      console.error('Restore failed:', err);
    });
  }

  origo.dispatch('load', viewer);
});

  return ui.Component({
    api,
    getConfig,
    onInit() {
      const defaultConfig = Object.assign({}, origoConfig, options);
      const base = document.createElement('base');
      base.href = defaultConfig.baseUrl;
      document.getElementsByTagName('head')[0].appendChild(base);
      origo = this;
      initViewer();
    }
  });
};

olInteraction.Draw.createBox = createBox;
olGeom.Polygon.fromCircle = fromCircle;
olGeom.Polygon.fromExtent = fromExtent;
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
