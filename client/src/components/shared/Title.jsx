import React from 'react'
import { Helmet } from 'react-helmet-async'

const Title = (title="chat App",descpription="this is chat app" ) => {
  return (
    <Helmet>
        <title>{title}</title>
        <meta name='description' content={descpription}/>
    </Helmet>
  )
}

export default Title
