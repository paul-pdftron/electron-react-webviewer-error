import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';

export default function Home() {
  const viewer = useRef();

  useEffect(() => {
    WebViewer(
      {
        path: '../node_modules/@pdftron/webviewer/public',
        // config: configPath,
        // licenseKey: pdftronLicenseKey,
        initialDoc:
          'https://pdftron.s3.amazonaws.com/downloads/pl/demo-annotated.pdf'
      },
      viewer.current
    )
      .then(instance => {
        console.log('Instance: ', instance);
        return null;
      })
      .catch(err => {
        console.log('Error: ', err);
      });
  }, []);

  return (
    <div className={styles.container} data-tid="container">
      <h2>Home</h2>
      {/* <Link to={routes.COUNTER}>to Counter</Link> */}
      {/* <Link to={routes.WEBVIEWER}>to Webviewer</Link> */}
      <div
        ref={viewer}
        style={{
          height: '80vh'
        }}
      />
    </div>
  );
}
