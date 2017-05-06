

// React
import { renderToStaticMarkup } from 'react-dom/server'
import { render, findDOMNode } from 'react-dom'
import { connect } from 'react-redux'
import { ReduxState, ReduxStateMapbox, ReduxStateParcels } from '../reducer'
import * as throttle from 'lodash/throttle'
import * as debounce from 'lodash/debounce'
import * as Immutable from 'immutable'

// Mapboxgl
import * as mapboxgl from 'mapbox-gl/dist/mapbox-gl'
import { MapMouseEvent, MapEvent, EventData } from 'mapbox-gl/dist/mapbox-gl'
import ReactMapboxGl from 'react-mapbox-gl'
import { Layer, Feature, Source, GeoJSONLayer, Popup } from 'react-mapbox-gl'
import { mapboxHostedLayers } from '../utils/mapboxHostedLayers'

import 'styles/MapBackground.scss'

// Components
import Title from './Title'
import ModalMap from './ModalMap'
import HouseCard from './HouseCard'
import HouseStats from './HouseStats'
import GeoSearchBar from './GeoSearchBar'
import Subscriptions from './Subscriptions'

import * as Button from 'antd/lib/button'
import 'antd/lib/button/style/css'

import * as Card from 'antd/lib/card'
import 'antd/lib/card/style/css'

import { geoData, geoParcel, gplacesDestination, userGQL, mapboxFeature, iPrediction } from './interfaceDefinitions'
import { isParcelNear, L2Norm } from '../utils/worker'
let MyWorker = require('worker-loader!../utils/worker.ts')





interface MapBackgroundProps {
  longitude: number
  latitude: number
  mapboxZoom: Array<number>
  flying: boolean
  // redux mapbox dispatchers
  updateLngLat?(lnglat: mapboxgl.LngLat): void
  updateFlyingStatus?(flying: boolean): void
  onZoomChange?(zoom): void
  toggleShowModal?(): void
  updateLotPlan?(): void
  userGQL: userGQL
  // gLngLat: is the lngLat for geoData, not the actual map center
  // used to calculate when we need to fetch additional geoData when moving on the map
  gLngLat: { longitude: number, latitude: number }
  // parcel data
  gData: geoData
  gRadius: geoData
  gRadiusWide: geoData
  gClickedParcels: geoData
  gMyPredictions: geoData
  gAllPredictions: geoData
  // redux parcel update dispatchers
  updateGeoDataLngLat?(gLngLat: { longitude: number, latitude: number }): void
  updateGeoData?(lngLat: mapboxgl.LngLat): void
  updateGeoRadius?(payload: { lngLat: mapboxgl.LngLat, gData: geoData }): void
  updateGeoRadiusWide?(payload: { lngLat: mapboxgl.LngLat, gData: geoData }): void
  updateGeoMyPredictions?(payload: { lngLat: mapboxgl.LngLat, gData: geoData }): void
  updateGeoClickedParcels?(gClickedParcels: geoData): void
  updateGeoAllPredictions?(gAllPredictions: geoData): void
}

interface MapBackgroundState {
  isSearch: boolean
  showHouseCard: boolean
  houseProps: {
    LOT: string
    PLAN: string
    LOT_AREA: number
  }
  map: mapboxgl.Map
}





export class MapBackground extends React.Component<MapBackgroundProps, MapBackgroundState> {

  constructor(props: MapBackgroundProps) {
    super(props)

    props.updateGeoData({ lng: props.longitude, lat: props.latitude })
    props.updateGeoRadius({ lngLat: { lng: props.longitude, lat: props.latitude }, gData: props.gData })
    props.updateGeoRadiusWide({ lngLat: { lng: props.longitude, lat: props.latitude }, gData: props.gData })

    if (props.data) {
      // pass (other user's predictions) to PredictionListings
      props.updateLocalPredictionListings(props.data.allPredictions)
      // Read prediction data from subscriptions
      let gAllPredictions: geoData = {
        ...props.gData,
        features: props.data.allPredictions.map((p: iPrediction) => ({
          type: p.house.geojsonparcel.type,
          geometry: p.house.geojsonparcel.geometry,
          properties: p.house.geojsonparcel.properties,
        }))
      }
      props.updateGeoAllPredictions(gAllPredictions)
    }

    this.state = {
      isSearch: false,
      showHouseCard: false,
      houseProps: { LOT: '', PLAN: '', LOT_AREA: 0 },
      map: undefined,
    }
  }

  componentWillMount() {
    this.worker = new MyWorker()
    // this.worker2 = new MyWorker()
  }

  componentDidMount() {
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
    return true
  }

  componentWillUpdate(nextProps: MapBackgroundProps) {
    let map: mapboxgl.Map = this.state.map
    if (map && this.props.flying && this.props.userGQL.predictions) {

      this.props.updateGeoMyPredictions({
        predictions: this.props.userGQL.predictions,
        gData: this.props.gData
      })

      this.props.updateGeoRadius({ lngLat: { lng: nextProps.longitude, lat: nextProps.latitude }, gData: nextProps.gData })
      this.props.updateGeoRadiusWide({ lngLat: { lng: nextProps.longitude, lat: nextProps.latitude }, gData: nextProps.gData })
    }
  }

  componentDidUpdate(prevProps: MapBackgroundProps) {
    let map: mapboxgl.Map = this.state.map
    if (map && this.props.flying) {
      map.flyTo({
        center: { lng: this.props.longitude, lat: this.props.latitude }
        speed: 2, // make flying speed 2x fast
        curve: 1.2, // make zoom intensity 1.1x as fast
      })
      if (this.props.flying == 'MyPredictionListings') {
        map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', '#1BD1C1')
        map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', '#ddd')
      } else {
        map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', '#c68')
        map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', '#ddd')
      }
      this.props.updateFlyingStatus(false)
    }
  }


  private handleClickedParcel = (features: mapboxFeature[]): void => {
    // features: are property parcels (polygons)
    if (features.length > 1) {
      // hover layer and parcel layer == 2 layers
      let { LOT, PLAN, LOTPLAN, LOT_AREA, O_SHAPE_Area, O_SHAPE_Length, LOCALITY } = features[0].properties
      this.props.updateLotPlan(LOTPLAN)

      let clickedParcel: geoParcel[] = this.props.gData.features
        .filter(parcel => (parcel.properties.LOT === LOT) && (parcel.properties.PLAN === PLAN))
      // add purple parcel, visited parcel
      this.props.updateGeoClickedParcels({
        ...this.props.gClickedParcels,
        features: [...clickedParcel]
      })
      this.setState({
        houseProps: { LOT: LOT, PLAN: PLAN, LOT_AREA: LOT_AREA },
        showHouseCard: true
      })

      // let popUp1 = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
      //   .setLngLat(map.unproject({ x: 10, y: window.innerHeight/2 }))
      //   .setDOMContent( document.getElementById('housecard1') )
      //   .addTo(map);
      // anchor options: 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', and 'bottom-right'
    }
  }

  private onClick = (map: mapboxgl.Map, event: MapMouseEvent): void => {
    // requires redux-thunk to dispatch 2 actions at the same time
    let lngLat: mapboxgl.LngLat = event.lngLat
    this.props.updateLngLat(lngLat)
    // var bearings = [-30, -15, 0, 15, 30]
    // map.flyTo({
    //   center: lngLat,
    //   speed: 2,
    //   // bearing: bearings[parseInt(Math.random()*4)],
    //   // pitch: parseInt(40+Math.random()*20)
    // })

    let features: mapboxFeature[] = map.queryRenderedFeatures(event.point, { layer: [mapboxHostedLayers.parkinsonParcelsFill.id] })
      .filter(f => f.properties.hasOwnProperty('LOT') && f.properties.hasOwnProperty('PLAN'))
    if (!features.length) {
      this.setState({ showHouseCard: false })
      return
    } else {
      console.info('features: ', features)
      this.handleClickedParcel(features)
      // add to visited parcels + show parcel stats
    }

    // update parcels near mouse click
    this.props.updateGeoRadius({ lngLat: { lng: lngLat.lng, lat: lngLat.lat }, gData: this.props.gData })
    this.props.updateGeoRadiusWide({ lngLat: { lng: lngLat.lng, lat: lngLat.lat }, gData: this.props.gData })

    map.getSource('gRadius').setData(this.props.gRadius)
    map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', mapboxlayerColors.radiusBorders)
    map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', mapboxlayerColors.radiusBordersWide)
  }

  private onMouseMove = (map: mapboxgl.Map, event: MapMouseEvent): void => {
    //// hover highlight
    let [feature] = map.queryRenderedFeatures(event.point, { layers: [mapboxHostedLayers.parkinsonParcelsFill.id] })
    // destructure list to get first feature
    if (feature) {
      let hoverFilterOptions = [
        'all',
        ["==", "LOT", feature.properties.LOT],
        ["==", "PLAN", feature.properties.PLAN],
      ]
      map.setFilter(mapboxHostedLayers.parkinsonParcelsHover.id, hoverFilterOptions)
    } else {
      map.setFilter(mapboxHostedLayers.parkinsonParcelsHover.id, ["==", "LOT", ""])
    }
  }


  private onDragStart = (map: mapboxgl.Map, event: EventData): void => {
    map.setPaintProperty(mapboxlayers.radiusBorders, 'line-opacity', 0.2)
    map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-opacity', 0.2)
  }

  private onDrag = (map: mapboxgl.Map, event: EventData): void => {
    let lngLat: mapboxgl.LngLat = map.getCenter()
    this.props.updateLngLat(lngLat)

    // IMPLEMENT a "APPROX CURRENT LOCATION" reducer
    // checks current location, compares to see if you have moved outside radius,
    // then updates position if you are more than a radius away from previous location.k
    let L2Distance = L2Norm(this.props.gLngLat, { lngCenter: lngLat.lng, latCenter: lngLat.lat })
    if (L2Distance > 0.006) {
      this.props.updateGeoDataLngLat({ longitude: lngLat.lng, latitude: lngLat.lat })
      this.props.updateGeoData(lngLat)
    }

    // update geojson parcel set in background worker
    // this.worker.postMessage({
    //   features: localDataRaw.features,
    //   longitude: this.props.longitude,
    //   latitude: this.props.latitude,
    //   radiusMax: 0.0080,
    // })
    // this.worker.onmessage = (m) => {
    //   this.props.updateGeoData({
    //     ...this.props.gData,
    //     features: m.data
    //   })
    // }
    // offload radius calculations to worker
  }

  private onDragEnd = (map: mapboxgl.Map, event: EventData): void => {
    let lngLat: mapboxgl.LngLat = map.getCenter()
    if (this.props.userGQL) {
      if (this.props.userGQL.predictions) {
        this.props.updateGeoMyPredictions({
          predictions: this.props.userGQL.predictions,
          gData: this.props.gData
        })
      }
    }

    this.props.updateGeoRadius({ lngLat: { lng: lngLat.lng, lat: lngLat.lat }, gData: this.props.gData })
    this.props.updateGeoRadiusWide({ lngLat: { lng: lngLat.lng, lat: lngLat.lat }, gData: this.props.gData })

    map.setPaintProperty(mapboxlayers.radiusBorders, 'line-color', mapboxlayerColors.radiusBorders)
    map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-color', mapboxlayerColors.radiusBordersWide)
    map.setPaintProperty(mapboxlayers.radiusBorders, 'line-opacity', 0.5)
    map.setPaintProperty(mapboxlayers.radiusBordersWide, 'line-opacity', 0.5)
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

    map.on("mouseout", () => {
      // Reset the parcel-fills-hover layer's filter when the mouse leaves the map
      map.setFilter(mapboxHostedLayers.parkinsonParcelsHover.id, ["==", "LOT", ""])
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

  render() {
    return (
      <div id="mapbox__container" className="Mapbox__MapBackground">

        <ReactMapboxGl style={mapboxstyles.dark}
          accessToken="pk.eyJ1IjoicGVpdGFsaW4iLCJhIjoiY2l0bTd0dDV4MDBzdTJ4bjBoN2J1M3JzZSJ9.yLzwgv_vC7yBFn5t-BYdcw"
          pitch={50} bearing={0}
          zoom={this.props.mapboxZoom}
          movingMethod="easeTo"
          onStyleLoad={this.onMapStyleLoad}
          onZoom={throttle(this.onZoom, 50)}
          onMouseMove={throttle(this.onMouseMove, 50)}
          onDragStart={this.onDragStart}
          onDrag={throttle(this.onDrag, 100)}
          onDragEnd={this.onDragEnd}
          onClick={this.onClick}
          containerStyle={{
            position: "absolute",
            top: 0,
            height: "100vh",
            width: "100vw",
        }}>

          <Layer {...mapboxHostedLayers.parkinsonParcels}/>
          <Layer {...mapboxHostedLayers.parkinsonParcelsFill}/>
          <Layer {...mapboxHostedLayers.parkinsonParcelsHover}/>
          <Layer {...mapboxHostedLayers.brisbaneSuburbs}/>
          <Layer {...mapboxHostedLayers.traffic}/>

          <Source id="gRadius"
            onSourceAdded={(source) => (source)}
            geoJsonSource={{ type: 'geojson', data: this.props.gRadius }}
          />
          <Layer sourceId="gRadius"
            id={ mapboxlayers.radiusBorders }
            type="line"
            paint={{ 'line-color': mapboxlayerColors.radiusBorders, 'line-opacity': 0.6, 'line-width': 1 }}
          />

          <Source id="gRadiusWide"
            onSourceAdded={(source) => (source)}
            geoJsonSource={{ type: 'geojson', data: this.props.gRadiusWide }}
          />
          <Layer sourceId="gRadiusWide"
            id={ mapboxlayers.radiusBordersWide }
            type="line"
            paint={{ 'line-color': mapboxlayerColors.radiusBordersWide, 'line-opacity': 0.6, 'line-width': 1 }}
          />


          <Source id="gClickedParcels"
            onSourceAdded={(source) => (source)}
            geoJsonSource={{ type: 'geojson', data: this.props.gClickedParcels }}
          />
          <Layer sourceId="gClickedParcels"
            id={ mapboxlayers.clickedParcelsBorders }
            type="line"
            paint={{ 'line-color': mapboxlayerColors.clickedParcelsFill, 'line-opacity': 0.7, 'line-width': 1 }}
          />
          <Layer sourceId="gClickedParcels"
            id={ mapboxlayers.clickedParcelsFill }
            type="fill"
            paint={{ 'fill-color': mapboxlayerColors.clickedParcelsFill, 'fill-opacity': 0.3 }}
          />

          <Source id="gMyPredictions"
            onSourceAdded={(source) => (source)}
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
            onSourceAdded={(source) => (source)}
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


///// MAPBOX PARCEL LAYER //////////
// Each parcel layer used on mapbox
const mapboxlayers = {
  radiusBorders: 'radius-borders',
  radiusBordersWide: 'radius-borders-wide',
  clickedParcelsBorders: 'clicked-parcels-borders',
  clickedParcelsFill: 'clicked-parcels-fill',
  myPredictionsBorders: 'my-predictions-borders',
  myPredictionsFill: 'my-predictions-fill',
  allPredictionsBorders: 'all-predictions-borders',
  allPredictionsFill: 'all-predictions-fill',
}
const mapboxlayerColors = {
  radiusBorders: '#58c',
  radiusBordersWide: '#aa88cc',
  clickedParcelsBorders: '#37505C',
  clickedParcelsFill: '#B8B3E9',
  myPredictionsBorders: '#ddd',
  myPredictionsFill: '#ddd',
  allPredictionsBorders: '#D17B88',
  allPredictionsFill: '#D17B88',
}
const mapboxstyles = {
  dark: 'mapbox://styles/mapbox/dark-v9',
  light: 'mapbox://styles/mapbox/light-v9',
  outdoors: 'mapbox://styles/mapbox/outdoors-v10',
  streets: 'mapbox://styles/mapbox/streets-v10',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  satelliteStreets: 'mapbox://styles/mapbox/satellite-streets-v10',
}




///////// REDUX ////////////
const mapStateToProps = ( state: ReduxState ): ReduxStateMapbox & ReduxStateParcels => {
  return {
    // reduxMapbox
    latitude: state.reduxMapbox.latitude,
    longitude: state.reduxMapbox.longitude,
    mapboxZoom: state.reduxMapbox.mapboxZoom,
    userGQL: state.reduxMapbox.userGQL,
    flying: state.reduxMapbox.flying,
    // reduxParcels
    gData: state.reduxParcels.gData,
    gLngLat: state.reduxParcels.gLngLat,
    gRadius: state.reduxParcels.gRadius,
    gRadiusWide: state.reduxParcels.gRadiusWide,
    gClickedParcels: state.reduxParcels.gClickedParcels,
    gMyPredictions: state.reduxParcels.gMyPredictions,
    gAllPredictions: state.reduxParcels.gAllPredictions,
  }
}

const mapDispatchToProps = ( dispatch ) => {
  return {
    updateLngLat: (lnglat: mapboxgl.LngLat) => dispatch(
      { type: "UPDATE_LNGLAT", payload: lnglat }
    ),
    updateFlyingStatus: (flyingStatus: boolean) => dispatch(
      { type: "UPDATE_FLYING", payload: flyingStatus }
    ),
    onZoomChange: (zoom: Array<number>) => dispatch(
      { type: "UPDATE_MAPBOX_ZOOM", payload: zoom }
    ),
    toggleShowModal: (showModal: boolean) => dispatch(
      { type: "SHOW_MODAL", payload: showModal }
    ),
    updateLotPlan: (lotPlan: string) => dispatch(
      { type: "UPDATE_LOTPLAN", payload: lotPlan }
    ),
    updateLocalPredictionListings: (localPredictions: iLocalPrediction[]) => dispatch(
      { type: "UPDATE_LOCAL_PREDICTION_LISTINGS", payload: localPredictions }
      // circle of parcels (unseen) to filter as user moves on the map
    ),
    updateGeoDataLngLat: (gLngLat: { longitude: number, latitude: number }) => dispatch(
      { type: "UPDATE_GEODATA_LNGLAT", payload: gLngLat }
      // circle of parcels (unseen) to filter as user moves on the map
    ),
    updateGeoData: (lngLat: mapboxgl.LngLat) => dispatch(
      { type: "UPDATE_GEODATA", payload: lngLat }
      // circle of parcels (invisible) to filter as user moves on the map
      // all other parcels are based on this layer (filtered from)
    ),
    updateGeoRadius: (payload: { lngLat: mapboxgl.LngLat, gData: geoData }) => dispatch(
      { type: "UPDATE_GEORADIUS", payload: payload }
      // circle of parcels on the map in UI
    ),
    updateGeoRadiusWide: (payload: { lngLat: mapboxgl.LngLat, gData: geoData }) => dispatch(
      { type: "UPDATE_GEORADIUS_WIDE", payload: payload }
      // circle of parcels (wide ring) on the map
    ),
    updateGeoMyPredictions: (payload: { predictions: iPrediction[], gData: geoData }) => dispatch(
      { type: "UPDATE_GEOMY_PREDICTIONS", payload: payload }
      // parcels which you've made a prediction on
    ),
    updateGeoClickedParcels: (gClickedParcels: geoData) => dispatch(
      { type: "UPDATE_GEOCLICKED_PARCELS", payload: gClickedParcels }
      // visited parcels on the map
    ),
    updateGeoAllPredictions: (gAllPredictions: geoData) => dispatch(
      { type: "UPDATE_GEOALL_PREDICTIONS", payload: gAllPredictions }
      // parcels which others have made predictions on (subscriptions)
    ),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)( MapBackground )


