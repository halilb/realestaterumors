

import * as React from 'react'
import { connect, MapStateToProps } from 'react-redux'
import { Link, withRouter, Location } from 'react-router-dom'

import * as Breadcrumb from 'antd/lib/breadcrumb'
import 'antd/lib/breadcrumb/style/css'

import 'styles/Navbar.scss'



interface NavbarProps {
  location?:  Location
}


export class Navbar extends React.Component<NavbarProps, any> {

  static getRouterPath = (pathname: string, n: number = 0): string => {
    return (pathname === '') ? '/' : pathname.split('/').slice(0, n+1).join('/')
  }

  componentDidMount() {
    let d = document.getElementById('nav-bar')
    window.addEventListener('scroll', this.onScroll)
  }
  componentWillUnmount() {
    let d = document.getElementById('nav-bar')
    d.removeEventListener('scroll', this.onScroll)
  }

  onScroll = (event) => {
    console.info(event)
  }


  render() {
    let { pathname } = this.props.location
    let crumbs = pathname.split('/').map((url, i) => {
      return (
        <Breadcrumb.Item key={url}>
          <Link to={ Navbar.getRouterPath(pathname, i) }>
            { url }
          </Link>
        </Breadcrumb.Item>
      )
    })

    return (
      <div id="nav-bar" className='navigation-bar'>
        <div className='Nav Breadcrumb'>
          <Breadcrumb>
            { crumbs }
          </Breadcrumb>
        </div>
      </div>
    )
  }
}


export default withRouter( Navbar )


