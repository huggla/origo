import Collection from 'ol/Collection';
import Feature from 'ol/Feature';
import geom from 'ol/geom/Geometry';
import { Component } from './ui';
import Map from './map';
import proj from './projection';
import getCapabilities from './getCapabilities';
import MapSize from './utils/mapsize';
import Featureinfo from './featureinfo';
import Selectionmanager from './selectionmanager';
import maputils from './maputils';
import utils from './utils';
import Layer from './layer';
import Main from './components/main';
import Footer from './components/footer';
import CenterMarker from './components/centermarker';
import flattenGroups from './utils/flattengroups';
import getcenter from './geometry/getcenter';
import isEmbedded from './utils/isembedded';
import generateUUID from './utils/generateuuid';
import permalink from './permalink/permalink';
import Stylewindow from './style/stylewindow';

console.log('VIEWER.JS LOADED – DEBUG MODE ON');

const Viewer = function Viewer(targetOption, options = {}) {
  console.log('VIEWER: Initializing with targetOption:', targetOption, 'options:', options);

  let map;
  let tileGrid;
  let featureinfo;
  let selectionmanager;
  let stylewindow;

  const {
    breakPoints,
    breakPointsPrefix,
    clsOptions = '',
    consoleId = 'o-console',
    mapCls = 'o-map',
    controls = [],
    featureinfoOptions = {},
    groups: groupOptions = [],
    pageSettings = {},
    projectionCode,
    projectionExtent,
    startExtent,
    extent = [],
    center: centerOption = [0, 0],
    zoom: zoomOption = 0,
    resolutions = null,
    layers: layerOptions = [],
    layerParams = {},
    map: mapName,
    params: urlParams = {},
    proj4Defs,
    styles = {},
    clusterOptions = {},
    tileGridOptions = {},
    url,
    palette
  } = options;

  // SÄKRA target
  const target = targetOption || options.target;
  if (!target || typeof target !== 'string') {
    throw new Error(`Viewer: Invalid target: ${target}. Must be a valid CSS selector (e.g. '#map')`);
  }

  // SÄKRA source – alltid ett objekt
  const source = (typeof options.source === 'object' && options.source !== null) ? options.source : {};
  console.log('VIEWER: source secured:', source);

  let {
    projection
  } = options;

  const viewerOptions = Object.assign({}, options);
  const center = urlParams.center || centerOption;
  const zoom = urlParams.zoom || zoomOption;
  const groups = flattenGroups(groupOptions);
  const layerStylePicker = {};

  const getCapabilitiesLayers = () => {
    console.log('DEBUG: getCapabilitiesLayers – source:', source);
    if (!source || typeof source !== 'object') {
      console.warn('getCapabilitiesLayers: source is not an object, returning {}');
      return Promise.resolve({});
    }

    const capabilitiesPromises = [];
    Object.keys(source).forEach(sourceName => {
      console.log('DEBUG: Processing source:', sourceName);
      const sourceOptions = source[sourceName];
      if (sourceOptions && typeof sourceOptions === 'object' && sourceOptions.capabilitiesURL) {
        console.log('DEBUG: Adding capabilities request for:', sourceName);
        capabilitiesPromises.push(getCapabilities(sourceName, sourceOptions.capabilitiesURL));
      }
    });

    if (capabilitiesPromises.length === 0) {
      console.log('DEBUG: No capabilities requests');
      return Promise.resolve({});
    }

    return Promise.all(capabilitiesPromises)
      .then(capabilitiesResults => {
        console.log('DEBUG: Capabilities results:', capabilitiesResults);
        const layers = {};
        capabilitiesResults.forEach(result => {
          if (result && result.name) {
            layers[result.name] = result.capabilites || [];
          }
        });
        return layers;
      })
      .catch(error => {
        console.error('getCapabilities error:', error);
        return {};
      });
  };

  const defaultTileGridOptions = {
    alignBottomLeft: true,
    extent,
    resolutions,
    tileSize: [256, 256]
  };
  const tileGridSettings = Object.assign({}, defaultTileGridOptions, tileGridOptions);
  let mapGridCls = '';
  if (pageSettings && pageSettings.mapGrid && pageSettings.mapGrid.visible) {
    mapGridCls = 'o-map-grid';
  }
  const cls = `${clsOptions} ${mapGridCls} ${mapCls} o-ui`.trim();
  const footerData = (pageSettings && pageSettings.footer) || {};
  const main = Main();
  const footer = Footer({ data: footerData });
  const centerMarker = CenterMarker();
  let mapSize;

  const addControl = function addControl(control) {
    if (control && control.onAdd && control.dispatch) {
      if (control.options && control.options.hideWhenEmbedded && isEmbedded(this.getTarget())) {
        if (typeof control.hide === 'function') {
          if (!['sharemap', 'link', 'about', 'print', 'draganddrop'].includes(control.name)) {
            this.addComponent(control);
          }
          control.hide();
        }
      } else {
        this.addComponent(control);
      }
    } else {
      console.warn('Invalid control:', control);
    }
  };

  const addControls = function addControls() {
    if (Array.isArray(controls)) {
      controls.forEach(control => this.addControl(control));
    }
  };

  const getExtent = () => extent;

  const getBreakPoints = function getBreakPoints(size) {
    return size && breakPoints && size in breakPoints ? breakPoints[size] : breakPoints;
  };

  const getFeatureinfo = () => featureinfo;

  const getSelectionManager = () => selectionmanager;

  const getStylewindow = () => stylewindow;

  const getCenter = () => getcenter;

  const getMapUtils = () => maputils;

  const getUtils = () => utils;

  const getMapName = () => mapName;

  const getTileGrid = () => tileGrid;

  const getTileGridSettings = () => tileGridSettings;

  const getTileSize = () => tileGridSettings.tileSize;

  const getViewerOptions = () => viewerOptions;

  const getUrl = () => url;

  const getStyle = (styleName) => {
    return styleName in styles ? styles[styleName] : null;
  };

  const setStyle = (styleName, style) => {
    if (styleName in styles) {
      styles[styleName] = style;
    }
  };

  const getStyles = () => styles;

  const addStyle = function addStyle(styleName, styleProps) {
    if (!(styleName in styles)) {
      styles[styleName] = styleProps;
    }
  };

  const getResolutions = () => resolutions;

  const getMapUrl = () => {
    let layerNames = '';
    let mapUrl = window.location.href.replace(window.location.search, '?') + '?';
    if (!map) return mapUrl;

    const mapView = map.getView();
    const centerCoords = mapView.getCenter().map(coord => parseInt(coord, 10));
    const zoomLevel = mapView.getZoom();
    const layers = map.getLayers().getArray();

    layers.forEach(el => {
      if (el.getVisible() === true) {
        layerNames += `${el.get('name')};`;
      } else if (el.get('legend') === true) {
        layerNames += `${el.get('name')},1;`;
      }
    });
    return `${mapUrl}${centerCoords}&${zoomLevel}&${layerNames.slice(0, -1)}`;
  };

  const getMap = () => map;

  const getLayers = () => map ? map.getLayers().getArray() : [];

  const getLayersByProperty = function getLayersByProperty(key, val, byName) {
    const layers = getLayers().filter(layer => layer.get(key) === val);
    return byName ? layers.map(l => l.get('name')) : layers;
  };

  const getLayer = function getLayer(layerName) {
    const layers = getLayers();
    let layer = layers.find(l => l.get('name') === layerName);
    if (!layer) {
      const groups = layers.filter(l => l.get('type') === 'GROUP');
      for (const group of groups) {
        layer = group.getLayers().getArray().find(l => l.get('name') === layerName);
        if (layer) break;
      }
    }
    return layer;
  };

  const getQueryableLayers = function getQueryableLayers(includeImageFeatureInfoMode = false) {
    return getLayers().filter(layer => {
      if (layer.get('queryable') && layer.getVisible()) return true;
      if (includeImageFeatureInfoMode && layer.get('queryable') && layer.get('imageFeatureInfoMode') === 'always') return true;
      return false;
    });
  };

  const getGroupLayers = () => getLayers().filter(l => l.get('type') === 'GROUP');

  const getSearchableLayers = function getSearchableLayers(searchableDefault) {
    const result = [];
    getLayers().forEach(layer => {
      let searchable = layer.get('searchable');
      searchable = searchable === undefined ? searchableDefault : searchable;
      if (searchable === 'always' || (searchable && layer.getVisible())) {
        result.push(layer.get('name'));
      }
    });
    return result;
  };

  const getGroup = (groupName) => groups.find(g => g.name === groupName);

  const getSource = (name) => {
    if (name in source) return source[name];
    throw new Error(`No source: ${name}`);
  };

  const getSource2 = (name) => name in source ? source[name] : undefined;

  const getGroups = () => groups;

  const getProjectionCode = () => projectionCode;

  const getProjection = () => projection;

  const getMapSource = () => source;

  const getControlByName = (name) => {
    const comp = this.getComponents().find(c => c.name === name);
    return comp || null;
  };

  const getSize = () => mapSize ? mapSize.getSize() : null;

  const getTarget = () => target;

  const getClusterOptions = () => clusterOptions;

  const getConsoleId = () => consoleId;

  const getInitialZoom = () => zoom;

  const getFooter = () => footer;

  const getMain = () => main;

  const getEmbedded = () => isEmbedded(target);

  const mergeSecuredLayer = (layerlist, capabilitiesLayers) => {
    console.log('DEBUG: mergeSecuredLayer – capabilitiesLayers:', capabilitiesLayers);
    if (!capabilitiesLayers || typeof capabilitiesLayers !== 'object' || Object.keys(capabilitiesLayers).length === 0) {
      return layerlist;
    }
    return layerlist.map(layer => {
      let secure = false;
      let layername = layer.name.split(':').pop();
      if (layername.includes('__')) {
        layername = layername.substring(0, layername.lastIndexOf('__'));
      }
      const layerSourceOptions = layer.source ? getSource2(layer.source) : null;
      if (layerSourceOptions && layerSourceOptions.capabilitiesURL) {
        secure = !capabilitiesLayers[layer.source]?.includes(layername);
      }
      return { ...layer, secure };
    });
  };

  const mergeSavedLayerProps = (initialLayerProps, savedLayerProps) => {
    return getCapabilitiesLayers().then(capabilitiesLayers => {
      if (!savedLayerProps) return mergeSecuredLayer(initialLayerProps, capabilitiesLayers);
      const merged = initialLayerProps.reduce((acc, initial) => {
        const name = initial.name.split(':').pop();
        const saved = savedLayerProps[name] || { visible: false, legend: false };
        if (savedLayerProps[name]?.altStyleIndex > -1) {
          const alt = initial.stylePicker[savedLayerProps[name].altStyleIndex];
          saved.clusterStyle = alt.clusterStyle;
          saved.style = alt.style;
          saved.defaultStyle = initial.type === 'WMS'
            ? (initial.stylePicker.find(s => s.initialStyle) || initial.stylePicker[0])
            : initial.style;
        }
        saved.name = initial.name;
        acc.push(Object.assign({}, initial, saved));
        return acc;
      }, []);
      return mergeSecuredLayer(merged, capabilitiesLayers);
    });
  };

  const removeOverlays = (overlays) => {
    if (!map) return;
    if (overlays) {
      if (Array.isArray(overlays) || overlays instanceof Collection) {
        overlays.forEach(o => map.removeOverlay(o));
      } else {
        map.removeOverlay(overlays);
      }
    } else {
      map.getOverlays().clear();
    }
  };

  const setMap = (newMap) => { map = newMap; };
  const setProjection = (newProj) => { projection = newProj; };

  const zoomToExtent = (geometry, level) => {
    if (!map || !geometry) return false;
    const view = map.getView();
    const ext = geometry.getExtent();
    if (ext) {
      view.fit(ext, { maxZoom: level });
      return ext;
    }
    return false;
  };

  const getLayerStylePicker = (layer) => layerStylePicker[layer.get('id')] || [];
  const addLayerStylePicker = (props) => { if (!layerStylePicker[props.name]) layerStylePicker[props.name] = props.stylePicker; };

  const addLayer = (props, before) => {
    let layerProps = props;
    if (props.layerParam && layerParams[props.layerParam]) {
      layerProps = Object.assign({}, layerParams[props.layerParam], props);
    }
    if (props.styleDef && !props.style) {
      const id = generateUUID();
      addStyle(id, [props.styleDef]);
      layerProps.style = id;
    }
    const layer = Layer(layerProps, this);
    addLayerStylePicker(layerProps);
    if (before && map) {
      const idx = map.getLayers().getArray().indexOf(before);
      map.getLayers().insertAt(idx, layer);
    } else if (map) {
      map.addLayer(layer);
    }
    this.dispatch('addlayer', { layerName: layerProps.name });
    return layer;
  };

  const removeLayer = (layer) => {
    if (map && layer) {
      this.dispatch('removelayer', { layerName: layer.get('name') });
      map.removeLayer(layer);
    }
  };

  const addLayers = (list) => list.slice().reverse().forEach(p => this.addLayer(p));
  const addGroup = (props) => {
    const def = Object.assign({ type: 'group' }, props);
    if (!groups.some(g => g.name === def.name)) {
      groups.push(def);
      this.dispatch('add:group', { group: def });
    }
  };
  const addGroups = (list) => list.forEach(g => this.addGroup(g));
  const removeGroup = (name) => {
    const group = groups.find(g => g.name === name);
    if (group) {
      getLayersByProperty('group', name).forEach(l => map.removeLayer(l));
      groups.splice(groups.indexOf(group), 1);
      this.dispatch('remove:group', { group });
    }
    groups.filter(g => g.parent === name).forEach(g => removeGroup(g.name));
  };

  const addSource = (name, props) => { if (!(name in source)) source[name] = props; };
  const addMarker = (coords, title, content, layerProps, show) => maputils.createMarker(coords, title, content, this, layerProps, show);
  const removeMarkers = (name) => maputils.removeMarkers(this, name);
  const getUrlParams = () => urlParams;

  const displayFeatureInfo = (feature, layerName) => {
    if (feature && featureinfo) {
      const fids = {}; fids[layerName] = [feature.getId()];
      featureinfo.showInfo(fids, { ignorePan: true });
      if (!urlParams.zoom && !urlParams.center && map) {
        map.getView().fit(feature.getGeometry(), {
          maxZoom: getResolutions().length - 2,
          padding: [15, 15, 40, 15],
          duration: 1000
        });
      }
    }
  };

// SÄKRA this → använd en lokal variabel
const viewer = this;

return Component({
  onInit() {
    console.log('VIEWER: onInit started');
    viewer.render();

    proj.registerProjections(proj4Defs);
    setProjection(proj.Projection({ projectionCode, projectionExtent }));
    tileGrid = maputils.tileGrid(tileGridSettings);
    stylewindow = Stylewindow({ palette, viewer });

    setMap(Map(Object.assign(options, { projection, center, zoom, target: viewer.getId() })));

    mergeSavedLayerProps(layerOptions, urlParams.layers)
      .then(layerProps => {
        console.log('DEBUG: Layers loaded:', layerProps);
        viewer.addLayers(layerProps);  // ← NU ÄR DET RÄTT!

        mapSize = MapSize(map, { breakPoints, breakPointsPrefix, mapId: viewer.getId() });

        if (urlParams.pin) featureinfoOptions.savedPin = urlParams.pin;
        else if (urlParams.selection) {
          featureinfoOptions.savedSelection = new Feature({
            geometry: new geom[urlParams.selection.geometryType](urlParams.selection.coordinates)
          });
        }

        featureinfoOptions.viewer = viewer;
        selectionmanager = Selectionmanager(featureinfoOptions);
        featureinfo = Featureinfo(featureinfoOptions);
        viewer.addComponent(selectionmanager);
        viewer.addComponent(featureinfo);
        viewer.addComponent(centerMarker);
        viewer.addControls();

        if (urlParams.feature) {
          const [layerName, idPart] = urlParams.feature.split('.');
          const layer = viewer.getLayer(layerName);
          if (layer && layer.get('type') !== 'GROUP') {
            const source = layer.getSource().source || layer.getSource();
            let id = idPart;
            if (layer.get('type') === 'WFS') {
              let base = layerName;
              if (layer.get('id')) base = layer.get('id').split(':').pop();
              else if (layerName.includes('__')) base = layerName.split('__')[0];
              id = `${base}.${idPart}`;
            }
            if (source.getFeatures().length > 0) {
              displayFeatureInfo(source.getFeatureById(id), layerName);
            } else {
              source.once('featuresloadend', () => displayFeatureInfo(source.getFeatureById(id), layerName));
            }
          }
        }

        if (!urlParams.zoom && !urlParams.mapStateId && startExtent && map) {
          map.getView().fit(startExtent, { size: map.getSize() });
        }

        console.log('VIEWER: Dispatching loaded');
        viewer.dispatch('loaded');
      })
      .catch(err => {
        console.error('Layer load error:', err);
        viewer.dispatch('loaded'); // Fortsätt ändå
      });
  },

  render() {
    const html = `<div id="${viewer.getId()}" class="${cls}">
                    <div class="transparent flex column height-full width-full absolute top-left no-margin z-index-low">
                      ${main.render()}${footer.render()}
                    </div>
                  </div>
                  <div id="loading" class="hide"><div class="loading-spinner"></div></div>`;
    const el = document.querySelector(target);
    if (!el) throw new Error(`Target not found: ${target}`);
    el.innerHTML = html;
    viewer.dispatch('render');
  },

  addControl, addControls, addGroup, addGroups, addLayer, addLayers, addSource, addStyle, addMarker,
  getBreakPoints, getCenter, getClusterOptions, getConsoleId, getControlByName, getExtent, getFeatureinfo,
  getFooter, getInitialZoom, getTileGridSettings, getGroup, getGroups, getMain, getMapSource, getMapUtils,
  getUtils, getQueryableLayers, getGroupLayers, getResolutions, getSearchableLayers, getSize, getLayer,
  getLayerStylePicker, getLayers, getLayersByProperty, getMap, getMapName, getMapUrl, getProjection,
  getProjectionCode, getSource, getStyle, getStyles, getTarget, getTileGrid, getTileSize, getUrl,
  getUrlParams, getViewerOptions, removeGroup, removeLayer, removeOverlays, removeMarkers, setStyle,
  zoomToExtent, getSelectionManager, getStylewindow, getEmbedded, permalink, generateUUID, centerMarker
});
};

export default Viewer;
