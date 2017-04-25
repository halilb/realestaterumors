


import * as React from 'react'
import { connect, Dispatch } from 'react-redux'
import { ReduxState, ReduxStateUser, ReduxStateParcels } from '../reducer'

import gql from 'graphql-tag'
import { graphql, ApolloProvider, withApollo, compose } from 'react-apollo'

// import * as mapboxgl from 'mapbox-gl/dist/mapbox-gl'
import { iPrediction, iHouse, userGQL, geoData } from './interfaceDefinitions'


import { SpinnerRectangle, SpinnerDots } from './Spinners'
import MapBackground from './MapBackground'
import LocalPredictions from './LocalPredictions'

import * as message from 'antd/lib/message'
import 'antd/lib/message/style/css'

import 'styles/Subscriptions.scss'



type A = { type: string, payload: any }
type LngLat = { lng: number, lat: number }

interface DispatchProps {
  updateLngLat?(lngLat: LngLat): Dispatch<A>
  updateFlyingStatus?(flyingStatus: boolean): Dispatch<A>
  updateGeoAllPredictions?(allPredictions: iPrediction[]): Dispatch<A>
}

interface StateProps {
  userGQL: userGQL
}

interface ReactProps {
  data?: SubscriptionState
}

interface SubscriptionState {
  allPredictions?: iPrediction[]
  error?: any
  loading?: boolean
  subscribeToMore?(params: {
    document?: any
    variables?: any
    updateQuery?(prevState: SubscriptionState, { subscriptionData }: SubscriptionResponse): SubscriptionState
    onError?(err: any): void
  }): Function
  variables?: Object
  [key: string]: any
}

interface SubscriptionResponse {
  subscriptionData?: {
    data?: {
      Prediction?: {
        mutation?: string
        node?: {
          prediction: number
          id: string
          user: { id: string, emailAddress: string }
          house: { id: string, address: string }
        }
        previousValues?: { id: string }
      }
    }
  }
}

interface antdMessage {
  info: any
}



export class Subscriptions extends React.Component<StateProps & DispatchProps & ReactProps, any> {

  componentWillMount() {
    this.subscription = this.startSubscriptions()
  }

  componentWillReceiveProps(nextProps) {
    if (!this.subscription) {
      this.subscription = this.startSubscriptions()
    }
  }

  private startSubscriptions = () => {
    return this.props.data.subscribeToMore({
      document: subscriptionQuery,
      variables: {},
      updateQuery: ( prevState, { subscriptionData } ) => {
        let mutationType = subscriptionData.data.Prediction.mutation
        let newPrediction: iPrediction = subscriptionData.data.Prediction.node

        switch (mutationType) {
          case 'CREATED': {
            let newAllPredictions = [...prevState.allPredictions, newPrediction]
            this._updateGeoAllPredictions(newAllPredictions)
            return {
              ...prevState,
              allPredictions: newAllPredictions
            }
          }
          case 'DELETED': {
            let newAllPredictions = prevState.allPredictions.filter(
              (p: iPrediction) => p.id !== subscriptionData.data.Prediction.previousValues.id
            )
            this._updateGeoAllPredictions(newAllPredictions)
            return {
              ...prevState,
              allPredictions: newAllPredictions
            }
          }
          default: {
            console.error(`Subscription mutationType: ${mutationType} not implemented!`)
            return prevState
          }
        }
      },
      onError: (err) => console.error(err),
    })
  }

  render() {
    if (this.props.data.error) {
      return <div>Error in Sub Component</div>
    }
    if (this.props.data.loading) {
      return (
      <div className="subscriptions-loading">
        Loading MapSubscriptions
        <SpinnerRectangle height='48px' width='6px' style={{ margin: '2rem' }}/>
      </div>
     )
    }
    if (this.props.data.allPredictions) {
      return (
        <div className="MapSubscriptions">
          <MapBackground data={this.props.data}/>
          <LocalPredictions data={this.props.data}/>
        </div>
      )
    }
  }
}



const query = gql`
query($emailAddress: String!) {
  allPredictions(filter: {
    AND: [
      { house: { locality_in: "PARKINSON" } },
      { user: { emailAddress_not_in: [$emailAddress] } }
    ]
  }) {
    id
    prediction
    user {
      id
      emailAddress
    }
    house {
      id
      address
      lng
      lat
      geojsonparcel {
        lotPlan
        city
        locality
        geometry
        properties
        lngCenter
        latCenter
      }
    }
  }
}
`

const subscriptionQuery = gql`
subscription {
  Prediction(filter: { mutation_in: [CREATED,DELETED] }) {
    mutation
    node {
      id
      prediction
      user {
        id
        emailAddress
      }
      house {
        id
        address
        lng
        lat
        geojsonparcel {
          lotPlan
          city
          locality
          geometry
          properties
          lngCenter
          latCenter
        }
      }
    }
    previousValues {
      id
    }
  }
}
`


const mapStateToProps = ( state: ReduxState ): ReduxStateUser & ReduxStateParcels => {
  return {
    userGQL: state.reduxUser.userGQL,
  }
}

const mapDispatchToProps = ( dispatch: Function ): DispatchProps => {
  return {
    updateLngLat: (lngLat) => dispatch(
      { type: 'UPDATE_LNGLAT', payload: lngLat }
    ),
    updateFlyingStatus: (flyingStatus: boolean) => dispatch(
      { type: 'UPDATE_FLYING', payload: flyingStatus }
    ),
    updateGeoAllPredictions: (gAllPredictions: geoData) => dispatch(
      { type: "UPDATE_GEOALL_PREDICTIONS", payload: gAllPredictions }
      // parcels which otherws have made predictions on (subscriptions)
    ),
  }
}

const queryOptions = {
  options: (ownProps: ReduxStateUser) => {
    return ({
      variables: {
        emailAddress: ownProps.userGQL.emailAddress
      },
      fetchPolicy: 'network-only'
    })
  }
}
export default compose(
  connect<StateProps, DispatchProps, ReactProps>(mapStateToProps, mapDispatchToProps),
  withApollo,
  graphql(query, queryOptions),
)( Subscriptions )






