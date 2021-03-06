

// React
import { renderToStaticMarkup } from 'react-dom/server'
import { render, findDOMNode } from 'react-dom'
import { connect } from 'react-redux'
import { ReduxState, ReduxStateUser, ReduxStateMapbox, ReduxStateParcels } from '../reducer'
import { ActionType, Actions as A } from '../reduxActions'

import * as throttle from 'lodash/throttle'
import * as debounce from 'lodash/debounce'
import * as Immutable from 'immutable'

// Mapboxgl
import * as mapboxgl from 'mapbox-gl'
// import * as mapboxgl from 'mapbox-gl/dist/mapbox-gl'
import { MapMouseEvent, MapEvent, EventData } from 'mapbox-gl/dist/mapbox-gl'
import ReactMapboxGl from 'react-mapbox-gl'
import { Layer, Feature, Source, GeoJSONLayer, Popup } from 'react-mapbox-gl'
import { mapboxHostedLayers, mapboxStyles } from '../utils/mapboxHostedLayers'

// apolloClient for updating GeoData
import { apolloClient } from '../index'
import gql from 'graphql-tag'


// Components + Styles
import 'styles/MapBackground.scss'
import Title from './Title'
import ModalMap from './ModalMap'
import HouseCard from './HouseCard'
import GeoSearchBar from './GeoSearchBar'

import * as Button from 'antd/lib/button'
import 'antd/lib/button/style/css'

import * as Card from 'antd/lib/card'
import 'antd/lib/card/style/css'

// Typings and Data validation
import { geoData, iGeojson, gplacesDestination, userGQL, mapboxFeature, iPrediction } from '../typings/interfaceDefinitions'
import { geojsonValidate } from '../typings/geojson-validate.d'
import * as geojsonValidation from 'geojson-validation'
declare var geojsonValidation: geojsonValidate

import { isParcelNear, L2Norm } from '../utils/worker'
let MyWorker = require('worker-loader!../utils/worker.ts')



interface ReactProps {
  data?: {
    allPredictions?: iPrediction[]
    error?: any
    loading?: boolean
  }
}
interface StateProps {
  // ReduxStateMapbox
  longitude: number
  latitude: number
  mapboxZoom: Array<number>
  mapboxStyle: string
  flyingTo: boolean | string
  // ReduxStateUser
  userGQL: userGQL
  // ReduxStateParcels
  gMyPredictions: geoData
  gAllPredictions: geoData
}
interface DispatchProps {
  // redux mapbox dispatchers
  updateLngLat?(lnglat: mapboxgl.LngLat): void
  updateFlyingTo?(flyingTo: boolean | string): void
  onZoomChange?(zoom: number[]): void
  toggleShowModal?(showModal: boolean): void
  updateGraphQLId?(GRAPHQL_ID: string): void
  // redux parcel update dispatchers
  updateGeoMyPredictions?(payload: { predictions: iPrediction[] }): void
  updateGeoAllPredictions?(payload: { predictions: iPrediction[] }): void
}

interface MapBackgroundState {
  isSearch: boolean
  showHouseCard: boolean
  houseProps: {
    LOT: string
    PLAN: string
    CA_AREA_SQM: number
  }
  isMobile: boolean
  map: mapboxgl.Map
}





export class MapBackground extends React.Component<StateProps & DispatchProps & ReactProps, MapBackgroundState> {

  constructor(props: ReactProps & StateProps & DispatchProps) {
    super(props)

    if (props.data) {
      // pass (other user's predictions) to PredictionListings
      props.updateLocalPredictionListings(props.data.allPredictions)
      props.updateGeoAllPredictions({ predictions: props.data.allPredictions })
    }

    this.state = {
      isSearch: false,
      showHouseCard: false,
      houseProps: { LOT: '', PLAN: '', CA_AREA_SQM: 0 },
      isMobile: false,
      map: undefined,
    }
  }

  static defaultProps = {
    mapboxStyle: mapboxStyles.nautical
  }

  componentWillMount() {
    this.setState({ isMobile: /Mobi|Tablet|iPad|iPhone/.test(navigator.userAgent) })
    // this.worker = new MyWorker()
    // this.worker2 = new MyWorker()
  }

  componentDidMount() {
    this.validateGeoJsonData()
    // var MapboxClient = require('mapbox')
    // const accessToken = 'pk.eyJ1IjoicGVpdGFsaW4iLCJhIjoiY2l0bTd0dDV4MDBzdTJ4bjBoN2J1M3JzZSJ9.yLzwgv_vC7yBFn5t-BYdcw'
    // var client = new MapboxClient(accessToken)
    // // 600 requests per minute: Mapbox
    // // 2,500 free requests per day: Google Maps
    // client.geocodeForward('Brisbane, Australia', function(err, res) {
    //   console.info(res)
    //   // res is the geocoding result as parsed JSON
    // })
  }

  componentWillReceiveProps(nextProps: MapBackgroundProps) {
  }

  shouldComponentUpdate(nextProps: MapBackgroundProps, nextState: MapBackgroundState) {
    if (this.props === nextProps && this.state === nextState) {
      return false
    }
    return true
  }

  componentWillUpdate(nextProps: MapBackgroundProps) {
    if (this.state.map) {
      if (nextProps.mapboxStyle === mapboxStyles.dark) {
        this.state.map.setPaintProperty(mapboxHostedLayers.brisbaneParcels.id, 'line-color', '#555')
      }
      if (nextProps.mapboxStyle === mapboxStyles.nautical) {
        this.state.map.setPaintProperty(mapboxHostedLayers.brisbaneParcels.id, 'line-color', '#bbb')
      }
    }
  }

  componentDidUpdate(prevProps: MapBackgroundProps) {
    let map: mapboxgl.Map = this.state.map
    //// Trigger: flyingTo event in "MyPredictionListing.tsx" and "LocalPredictions.tsx"
    if (map && this.props.flyingTo) {
      ///// fade parcels out before flying
      map.flyTo({
        center: { lng: this.props.longitude, lat: this.props.latitude }
        speed: 0.8, // make flying speed 2x fast
        curve: 1, // make zoom intensity 1.1x as fast
      })
      switch (this.props.flyingTo) {
        case 'MyPredictionListings': {
          map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', '#3BD1C1')
          map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', '#1BD1C1')
          break;
        }
        case 'LocalPredictions': {
          map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', '#c68')
          map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', '#c8a')
          break;
        }
        default: {
          map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', '#F8F1AD')
          map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', '#ddd')
        }
      }
      this.props.updateFlyingTo(false)
    }
  }


  private onClick = (map: mapboxgl.Map, event: MapMouseEvent): void => {
    // requires redux-thunk to dispatch 2 actions at the same time
    let lngLat: mapboxgl.LngLat = event.lngLat
    this.props.updateLngLat(lngLat)
    let zoom = map.getZoom()
    console.info(zoom)

    // if zoom > 15 -> click suburb
    // then reveal screen with 2 tabs: bet agents, best predictors in area
    // ranking screen

    if (zoom > 14) {
      let features = map.queryRenderedFeatures(
        event.point,
        { layer: [mapboxHostedLayers.brisbaneSuburbsFill.id] }
      )
      console.info(features)
    }

    // if zoom < 15 -> click parcels

    let features = map.queryRenderedFeatures(
      event.point,
      { layer: [mapboxHostedLayers.brisbaneParcelsFill.id] }
    ).filter(f => f.properties.hasOwnProperty('LOT') && f.properties.hasOwnProperty('PLAN'))

    if (!features.length) {
      this.setState({ showHouseCard: false })
      return
    } else {
      console.info('features: ', features)
      this.handleClickedParcel(features, map)
      // add to visited parcels + show parcel stats
    }
  }

  private handleClickedParcel = (features: mapboxFeature[], map: mapboxgl): void => {
    // features: are property parcels (polygons)
    if (features.length > 1) {
      // hover layer and parcel layer == 2 layers
      let { LOT, PLAN, LOTPLAN, CA_AREA_SQM, GRAPHQL_ID } = features[0].properties
      this.props.updateGraphQLId(GRAPHQL_ID)

      let hoverFilterOptions = [
        'all',
        ["==", "LOT", features[0].properties.LOT],
        ["==", "PLAN", features[0].properties.PLAN],
      ]
      map.setFilter(mapboxHostedLayers.brisbaneParcelsClicked.id, hoverFilterOptions)

      this.setState({
        houseProps: { LOT: LOT, PLAN: PLAN, CA_AREA_SQM: CA_AREA_SQM },
        showHouseCard: true
      })

      // let popUp1 = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
      //   .setLngLat(map.unproject({ x: 10, y: window.innerHeight/2 }))
      //   .setDOMContent( document.getElementById('housecard1') )
      //   .addTo(map);
      // anchor options: 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', and 'bottom-right'
    }
  }


  private onMouseMove = (map: mapboxgl.Map, event: MapMouseEvent): void => {
    if (map.getZoom() > 15) {
      //// hover parcels
      //// hover highlight // destructure list to get first feature
      let [feature] = map.queryRenderedFeatures(event.point, { layers: [mapboxHostedLayers.brisbaneParcelsFill.id] })
      if (feature) {
        let hoverFilterOptions = [
          'all',
          ["==", "LOT", feature.properties.LOT],
          ["==", "PLAN", feature.properties.PLAN],
        ]
        map.setFilter(mapboxHostedLayers.brisbaneParcelsHover.id, hoverFilterOptions)
      } else {
        map.setFilter(mapboxHostedLayers.brisbaneParcelsHover.id, ["==", "LOT", ""])
      }
    }

    if (map.getZoom() <= 15) {
      //// hover suburbs
      let [feature] = map.queryRenderedFeatures(event.point, { layers: [mapboxHostedLayers.brisbaneSuburbsFill.id] })
      if (feature) {
        let hoverFilterOptions = [
          "all",
          ["==", "LOC_PID", feature.properties.LOC_PID],
        ]
        map.setFilter(mapboxHostedLayers.brisbaneSuburbsHover.id, hoverFilterOptions)
      } else {
        map.setFilter(mapboxHostedLayers.brisbaneSuburbsHover.id, ["==", "LOC_PID", ""])
      }
    }
  }


  private onDragStart = (map: mapboxgl.Map, event: EventData): void => {
  }

  private onDrag = (map: mapboxgl.Map, event: EventData): void => {
    let lngLat: mapboxgl.LngLat = map.getCenter()
    this.props.updateLngLat(lngLat)

    // "APPROX CURRENT LOCATION" reducer:
    // checks current location, compares to see if you have moved outside radius,
    // then updates position if you are more than a radius away from previous location.k
    // let L2Distance = L2Norm(this.props.gLngLat, { lngCenter: lngLat.lng, latCenter: lngLat.lat })
    // if (L2Distance > 0.005) {
    //   console.info("gLntLat changed:", lngLat)
    //   this.props.updateGeoDataLngLat({ lng: lngLat.lng, lat: lngLat.lat })
    // }
  }

  private onDragEnd = (map: mapboxgl.Map, event: EventData): void => {
    if (this.state.isMobile) {
      let lngLat: mapboxgl.LngLat = map.getCenter()
      this.props.updateLngLat(lngLat)
    }
  }

  private onZoom = (map: mapboxgl.Map, event: EventData): void => {
    this.props.onZoomChange([...[map.getZoom()]])
    // must pass new reference to mapboxZoom: Array<number>
    // Spread operator creates new Array object.
  }

  private onMapStyleLoad = (map: mapboxgl.Map, event: EventData): void => {
    map.setCenter([this.props.longitude, this.props.latitude])
    map.doubleClickZoom.disable()
    map.scrollZoom.disable()
    map.addControl(new mapboxgl.NavigationControl())

    // if (/Mobi|Tablet|iPad|iPhone/.test(navigator.userAgent)) {
    //   // disable zoom on mobile, UX issues with native browser zoom
    //   map.scrollZoom.disable()
    //   map.addControl(new mapboxgl.NavigationControl())
    // }

    // set tile visiblity zoom ranges
    map.setLayerZoomRange(mapboxHostedLayers.brisbaneParcels.id, 15, 22)
    map.setLayerZoomRange(mapboxHostedLayers.brisbaneParcelsFill.id, 15, 22)
    map.setLayerZoomRange(mapboxHostedLayers.brisbaneParcelsHover.id, 15, 22)
    map.setLayerZoomRange(mapboxHostedLayers.brisbaneParcelsClicked.id, 15, 22)
    map.setLayerZoomRange(mapboxlayers.radiusBorders, 15, 22)
    map.setLayerZoomRange(mapboxlayers.radiusBordersWide, 15, 22)

    map.setLayerZoomRange(mapboxHostedLayers.brisbaneSuburbs.id, 11, 18)
    map.setLayerZoomRange(mapboxHostedLayers.brisbaneSuburbsFill.id, 11, 15)
    map.setLayerZoomRange(mapboxHostedLayers.brisbaneSuburbsHover.id, 11, 15)

    map.on("mouseout", () => {
      // Reset the parcel-fills-hover layer's filter when the mouse leaves the map
      map.setFilter(mapboxHostedLayers.brisbaneParcelsHover.id, ["==", "LOT", ""])
    })
    map.setStyle({
      ...map.getStyle(),
      transition: { duration: 500, delay: 0 }
    })
    map.addLayer(mapboxHostedLayers.threeDBuildings)
    this.setState({ map })
    // preferably, pass map as a prop to GeoSuggest component
    // but how? setting this.map does not work since it will be null.
  }


  validateGeoJsonData = () => {
    ['gMyPredictions', 'gAllPredictions'].map(s => {
      if (!geojsonValidation.valid(this.props[s])) {
        console.info(`invalid GeoJson for layer: ${s}`)
        console.info(this.props[s])
      }
    })
  }

  render() {
    return (
      <div id="mapbox__container" className="Mapbox__MapBackground">

        <ReactMapboxGl style={this.props.mapboxStyle}
          accessToken="pk.eyJ1IjoicGVpdGFsaW4iLCJhIjoiY2l0bTd0dDV4MDBzdTJ4bjBoN2J1M3JzZSJ9.yLzwgv_vC7yBFn5t-BYdcw"
          pitch={50} bearing={0}
          zoom={this.props.mapboxZoom}
          movingMethod="easeTo"
          onStyleLoad={this.onMapStyleLoad}
          onZoom={throttle(this.onZoom, 50)}
          onMouseMove={throttle(this.onMouseMove, 50)}
          onDragStart={this.onDragStart}
          onDrag={ this.state.isMobile ? undefined : throttle(this.onDrag, 64)}
          onDragEnd={ this.state.isMobile ? this.onDragEnd : undefined}
          onClick={this.onClick}
          containerStyle={{
            position: "absolute",
            top: 0,
            height: "calc(100vh - 175px)", // 175px for carousel height
            width: "100vw",
        }}>

          <Layer {...mapboxHostedLayers.brisbaneParcels}/>
          <Layer {...mapboxHostedLayers.brisbaneParcelsFill}/>
          <Layer {...mapboxHostedLayers.brisbaneParcelsHover}/>
          <Layer {...mapboxHostedLayers.brisbaneParcelsClicked}/>

          <Layer {...mapboxHostedLayers.brisbaneSuburbs}/>
          <Layer {...mapboxHostedLayers.brisbaneSuburbsFill}/>
          <Layer {...mapboxHostedLayers.brisbaneSuburbsHover}/>
          <Layer {...mapboxHostedLayers.traffic}/>

          <LayerFilter id={ mapboxlayers.radiusBorders }
            paint={{
              'line-color': {
                "property": "lngCenter",
                "type": "exponential",
                "stops": [
                  [this.props.longitude - 0.0015, mapboxlayerColors.radiusBorders],
                  [this.props.longitude - 0.001, mapboxlayerColors.radiusBordersWide],
                  [this.props.longitude + 0.001, mapboxlayerColors.radiusBordersWide],
                  [this.props.longitude + 0.0015, mapboxlayerColors.radiusBorders],
                ]
              },
              'line-width': 1,
              'line-opacity': {
                "property": "lngCenter",
                "type": "exponential",
                "stops": [
                  [this.props.longitude - 0.004, 0.01],
                  [this.props.longitude - 0.003, 0.1],
                  [this.props.longitude - 0.002, 0.2],
                  [this.props.longitude - 0.001, 0.5],
                  [this.props.longitude - 0.000, 0.8],
                  [this.props.longitude + 0.001, 0.5],
                  [this.props.longitude + 0.002, 0.2],
                  [this.props.longitude + 0.003, 0.1],
                  [this.props.longitude + 0.004, 0.01],
                ]
              }
            }}
            filter={[
              'all',
              ['<=', 'lngCenter', this.props.longitude + 0.0040],
              ['>=', 'lngCenter', this.props.longitude - 0.0040],
              ['<=', 'latCenter', this.props.latitude  + 0.0018],
              ['>=', 'latCenter', this.props.latitude  - 0.0018],
            ]}
          />

          {(
            // !this.state.isMobile &&
            true &&
            <LayerFilter id={ mapboxlayers.radiusBordersWide }
              paint={{
                'line-color': {
                  "property": "lngCenter",
                  "type": "exponential",
                  "stops": [
                    [this.props.longitude - 0.001, mapboxlayerColors.radiusBordersWide],
                    [this.props.longitude + 0.001, mapboxlayerColors.radiusBordersWide],
                  ]
                },
                'line-width': 1,
                'line-opacity': {
                  "property": 'latCenter',
                  "type": "exponential",
                  "stops": [
                    [this.props.latitude - 0.004, 0.05],
                    [this.props.latitude - 0.003, 0.1],
                    [this.props.latitude - 0.00171, 0.4],
                    [this.props.latitude - 0.0017, 0.0],
                    [this.props.latitude + 0.0017, 0.0],
                    [this.props.latitude + 0.00171, 0.4],
                    [this.props.latitude + 0.003, 0.1],
                    [this.props.latitude + 0.004, 0.05],
                    [this.props.latitude + 0.005, 0.01],
                  ]
                }
              }}
              filter={[
                'all',
                ['<=', 'lngCenter', this.props.longitude + 0.0017],
                ['>=', 'lngCenter', this.props.longitude - 0.0017],
                ['<=', 'latCenter', this.props.latitude  + 0.005],
                ['>=', 'latCenter', this.props.latitude  - 0.005],
              ]}
            />
          )}

          <Source id="gMyPredictions"
            geoJsonSource={{ type: 'geojson', data: this.props.gMyPredictions }}
          />
          <Layer sourceId="gMyPredictions"
            id={ mapboxlayers.myPredictionsBorders }
            type="line"
            paint={{ 'line-color': mapboxlayerColors.myPredictionsBorders, 'line-opacity': 0.6, 'line-width': 1 }}
          />
          <Layer sourceId="gMyPredictions"
            id={ mapboxlayers.myPredictionsFill }
            type="fill"
            paint={{ 'fill-color': mapboxlayerColors.myPredictionsFill, 'fill-opacity': 0.3 }}
          />

          <Source id="gAllPredictions"
            geoJsonSource={{ type: 'geojson', data: this.props.gAllPredictions }}
          />
          <Layer sourceId="gAllPredictions"
            id={ mapboxlayers.allPredictionsBorders }
            type="line"
            paint={{ 'line-color': mapboxlayerColors.allPredictionsBorders, 'line-opacity': 0.4, 'line-width': 1 }}
          />
          <Layer sourceId="gAllPredictions"
            id={ mapboxlayers.allPredictionsFill }
            type="fill"
            paint={{ 'fill-color': mapboxlayerColors.allPredictionsFill, 'fill-opacity': 0.2 }}
          />

        </ReactMapboxGl>


        <HouseCard id='housecard1'
          longitude={this.props.longitude}
          latitude={this.props.latitude}
          houseProps={this.state.houseProps}
          showHouseCard={this.state.showHouseCard}
        />

        <GeoSearchBar map={this.state.map} />

      </div>
    )
  }
}


let LayerFilter = ({ id, paint, filter }) => {
  return (
    <Layer {{
      id: id,
      type: 'line',
      sourceId: {
        type: 'vector',
        url: 'mapbox://peitalin.1rs9p367'
      },
      paint: paint,
      layout: {},
      layerOptions: {
        'source-layer': 'mapbox_graphcool_brisbane-ax7zqf',
        filter: filter,
      }
    }}/>
  )
}

///// MAPBOX PARCEL LAYER //////////
// Each parcel layer used on mapbox
export const mapboxlayers = {
  radiusBorders: 'radius-borders',
  radiusBordersWide: 'radius-borders-wide',
  myPredictionsBorders: 'my-predictions-borders',
  myPredictionsFill: 'my-predictions-fill',
  allPredictionsBorders: 'all-predictions-borders',
  allPredictionsFill: 'all-predictions-fill',
}
export const mapboxlayerColors = {
  // radiusBorders: '#c8c3f9',
  // radiusBordersWide: '#ccaaee',
  radiusBorders: '#B8B3E9',
  radiusBordersWide: '#aa88cc',
  myPredictionsBorders: '#1BD1C1',
  myPredictionsFill: '#1BD1C1',
  allPredictionsBorders: '#D17B88',
  allPredictionsFill: '#D17B88',
}




///////// REDUX ////////////
const mapStateToProps = ( state: ReduxState ): ReduxStateMapbox & ReduxStateParcels => {
  return {
    // reduxMapbox
    latitude: state.reduxMapbox.latitude,
    longitude: state.reduxMapbox.longitude,
    mapboxZoom: state.reduxMapbox.mapboxZoom,
    mapboxStyle: state.reduxMapbox.mapboxStyle,
    userGQL: state.reduxMapbox.userGQL,
    flyingTo: state.reduxMapbox.flyingTo,
    // reduxParcels
    gLngLat: state.reduxParcels.gLngLat,
    gMyPredictions: state.reduxParcels.gMyPredictions,
    gAllPredictions: state.reduxParcels.gAllPredictions,
  }
}

const mapDispatchToProps = ( dispatch ) => {
  return {
    ////////// Mapbox Reducer Actions
    updateLngLat: (lnglat: mapboxgl.LngLat) => dispatch(
      { type: A.Mapbox.UPDATE_LNGLAT, payload: lnglat }
    ),
    updateFlyingTo: (flyingTo: boolean | string) => dispatch(
      { type: A.Mapbox.UPDATE_FLYING_TO, payload: flyingTo }
    ),
    onZoomChange: (zoom: Array<number>) => dispatch(
      { type: A.Mapbox.UPDATE_MAPBOX_ZOOM, payload: zoom }
    ),
    toggleShowModal: (showModal: boolean) => dispatch(
      { type: A.Mapbox.SHOW_MODAL, payload: showModal }
    ),
    updateGraphQLId: (GRAPHQL_ID: string) => dispatch(
      { type: A.Mapbox.UPDATE_GRAPHQL_ID, payload: GRAPHQL_ID }
    ),
    updateLocalPredictionListings: (localPredictions: iLocalPrediction[]) => dispatch(
      { type: A.Mapbox.UPDATE_LOCAL_PREDICTION_LISTINGS, payload: localPredictions }
      // circle of parcels (unseen) to filter as user moves on the map
    ),
    ////////// Parcel Reducer Actions
    updateGeoDataLngLat: (gLngLat: mapboxgl.LngLat) => dispatch(
      { type: A.GeoJSON.UPDATE_GEOJSON_DATA_LNGLAT, payload: gLngLat }
      // circle of parcels (unseen) to filter as user moves on the map
    ),
    updateGeoMyPredictions: (payload: { predictions: iPrediction[] }) => dispatch(
      { type: A.GeoJSON.UPDATE_GEOJSON_MY_PREDICTIONS, payload: payload }
      // parcels which you've made a prediction on
    ),
    updateGeoAllPredictions: (payload: { predictions: iPrediction[] }) => dispatch(
      { type: A.GeoJSON.UPDATE_GEOJSON_ALL_PREDICTIONS, payload: payload }
      // parcels which others have made predictions on (subscriptions)
    ),
  }
}

export default connect<StateProps, DispatchProps, ReactProps>(mapStateToProps, mapDispatchToProps)( MapBackground )


