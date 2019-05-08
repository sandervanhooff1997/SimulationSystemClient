<template>
  <div class="map" id="map"></div>
</template>

<script>
import axios from "axios";

import mapboxgl from "mapbox-gl/dist/mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.min";
// import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

// import MapboxDirections from "@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions";
// import "@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css";

export default {
  data() {
    return {
      axiosDirections: null,
      axiosGeocoding: null,
      accessToken:
        "pk.eyJ1Ijoic3ZoMTk5NyIsImEiOiJjamZ4bmF0azQweWF1MnprZG02ZTB6dWFsIn0.-058LEniBsf5Tcoy12SVhQ",
      map: null,
      mapConfig: {
        container: "map", // container id
        style: "mapbox://styles/mapbox/streets-v11", // stylesheet location
        center: [10, 51], // starting position [lng, lat]
        zoom: 5 // starting zoom
      },
      points: [
        [13, 52],
        [11, 48],
        [7, 51],
        [7.5, 51],
        [8, 52],
        [12, 51],
        [14, 51],
        [9, 49],
        [8.5, 50],
        [9.4, 51.3]
      ],
      geocoder: null,
      carTrackers: [1]
    };
  },
  methods: {
    /**
     * Gets a random point
     * never the same point as current position
     */
    getRandomPoint(currentPoint) {
      let index = Math.floor(Math.random() * this.points.length);

      while (this.points[index] === currentPoint) {
        index = Math.floor(Math.random() * this.points.length);
      }

      return this.points[index];
    },

    /**
     * Gets the route from MapBox Directions API
     */
    calculateRoute(origin, destination) {
      return new Promise((resolve, reject) => {
        let self = this;

        let url = `/mapbox/driving/${origin.join()};${destination.join()}?geometries=geojson&steps=true&access_token=${
          self.accessToken
        }`;

        self.axiosDirections
          .get(url)
          .then(res => {
            resolve(res.data.routes[0]);
          })
          .catch(err => {
            console.log("calculateRoute() error: " + err);
            reject();
          });
      });
    },

    /**
     * Convert mapbox route response to own custom route object
     */
    async convertCalculatedRoute(route) {
      return new Promise((resolve, reject) => {
        let self = this;

        let convertedRoute = {
          distance: route.distance,
          duration: route.duration,
          steps: []
        };

        let promises = [];
        route.geometry.coordinates.forEach(coordinate => {
          promises.push(self.getPlaceFromCoordinate(coordinate));
        });

        Promise.all(promises).then(places => {
          for (let i = 0; i < route.geometry.coordinates.length; i++) {
            let step = {
              address: places[i],
              coordinate: route.geometry.coordinates[i]
            };

            convertedRoute.steps.push(step);
          }

          resolve(convertedRoute);
        });
      });
    },

    /**
     * returns a place with the MapBox API
     */
    getPlaceFromCoordinate(coordinate) {
      return new Promise((resolve, reject) => {
        let self = this;

        self.axiosGeocoding
          .get(
            `/mapbox.places/${coordinate.join()}.json?access_token=${
              self.accessToken
            }`
          )
          .then(res => {
            let data = res.data;
            let feature = data.features[0];
            if (feature.place_name) resolve(feature.place_name);
            else resolve("");
          })
          .catch(err => {
            console.log("convertCalculatedRoute() error: " + err);
            resolve("");
          });
      });
    },

    /**
     * make all cars start driving
     */
    start() {
      this.carTrackers.forEach(carTracker => {
        this.startDriving(carTracker);
      });
    },

    /**
     * make a single car start driving
     */
    async startDriving(carTracker, startPoint) {
      let origin = startPoint ? startPoint : this.getRandomPoint();
      let destination = this.getRandomPoint(origin);

      let route = await this.calculateRoute(origin, destination);
      if (!route) return;

      let convertedRoute = await this.convertCalculatedRoute(route);
      let nextRoute = await this.animateRoute(convertedRoute);

      // // infinite driving
      // if (nextRoute) {
      //   this.startDriving(carTracker, destination);
      // }
    },

    /**
     * animate a route based on distance, duration and steps
     */
    animateRoute(route) {
      return new Promise((resolve, reject) => {
        let self = this;
        let totalDistance = route.distance;
        let totalCalculatedDistance = 0;
        let totalDuration = route.duration;
        let steps = route.steps;

        console.log(route);
        for (let i = 0; i < steps.length; i++) {
          console.log(steps[i]);
          if (i === 0) continue;

          let step1 = steps[i - 1];
          let step2 = steps[i];

          let distance = self.getDistance(
            step1.coordinate[1],
            step1.coordinate[0],
            step2.coordinate[1],
            step2.coordinate[0]
          );
          console.log(distance);
          totalCalculatedDistance += distance;
        }

        console.log(totalDistance, totalCalculatedDistance * 1000);
        resolve();
        // let interval = setInterval(() => {
        //   //
        // }, 1000);
      });
    },

    /**
     * calculates distance between 2 points
     */
    getDistance(lat1, lon1, lat2, lon2) {
      var p = 0.017453292519943295; // Math.PI / 180
      var c = Math.cos;
      var a =
        0.5 -
        c((lat2 - lat1) * p) / 2 +
        (c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))) / 2;

      return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
    },

    /**
     * Initialize mapbox map
     */
    initMap() {
      return new Promise((resolve, reject) => {
        let self = this;

        mapboxgl.accessToken = self.accessToken;

        self.map = new mapboxgl.Map(self.mapConfig);

        resolve();
      });
    },

    /**
     * creates an axios base instance
     */
    initAxios() {
      this.axiosDirections = axios.create({
        baseURL: "https://api.mapbox.com/directions/v5/",
        timeout: 10000
      });

      this.axiosGeocoding = axios.create({
        baseURL: "https://api.mapbox.com/geocoding/v5/",
        timeout: 10000
      });
    }
  },

  async mounted() {
    await this.initMap();
    this.initAxios();
    this.start();
  }
};
</script>

<style>
.map {
  width: 100%;
  height: 100%;
}
</style>

