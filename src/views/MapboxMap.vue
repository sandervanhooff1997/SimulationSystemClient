<template>
  <div class="fullscreen">
    <div class="fullscreen" id="map"></div>
    <v-btn @click="config.show = !config.show" dark color="primary" class="configBtn">Config</v-btn>
    <div class="toolbox" v-if="config.show">
      <v-text-field
        hide-details
        placeholder="Number of vehicles"
        v-model="config.vehicles"
        :min="config.minVehicles"
        :max="config.maxVehicles"
      ></v-text-field>
      <v-checkbox hide-details v-model="config.showRoutes" label="Show Routes"></v-checkbox>
      <v-checkbox hide-details v-model="config.extremeSpeed" label="Extreme speed"></v-checkbox>
      <v-btn @click="start()" color="primary" dark>Start</v-btn>
    </div>
  </div>
</template>

<script>
import axios from "axios";

import mapboxgl from "mapbox-gl/dist/mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export default {
  data() {
    return {
      config: {
        show: false,
        vehicles: 1,
        minVehicles: 0,
        maxVehicles: 10,
        showRoutes: true,
        extremeSpeed: true
      },
      axiosDirections: null,
      axiosGeocoding: null,
      axiosMovementRegistration: null,
      axiosBillAdministration: null,
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
        [13.3888599, 52.5170365],
        [11.5753822, 48.1371079],
        [8.8071646, 53.0758196],
        [7.0158171, 51.4582235],
        [7.4652789, 51.5142273],
        [6.7763137, 51.2254018],
        [9.1800132, 48.7784485],
        [8.6820917, 50.1106444],
        [6.959974, 50.938361],
        [10.000654, 53.550341],
        [14.227151, 53.446844],
        [13.74763, 51.042918],
        [13.375084, 48.616017],
        [7.849644, 48.007183],
        [9.940572, 49.809384],
        [7.483525, 53.468601],
        [8.052617, 52.275448],
        [6.663588, 49.749765],
        [11.121661, 49.501876],
        [9.439866, 54.787655],
        [10.451526, 51.165691]
      ],
      geocoder: null
      // movements
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
    getRoute(origin, destination) {
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
            console.log("getRoute() error: " + err);
            reject();
          });
      });
    },

    /**
     * Convert mapbox route response to own custom route object
     */
    async convertRoute(route, carTrackerId, destination, index) {
      return new Promise((resolve, reject) => {
        let self = this;

        let convertedRoute = {
          carTrackerId,
          destination,
          index,
          distance: route.distance,
          duration: route.duration,
          movements: [],
          coordinates: []
        };

        let promises = [];
        route.geometry.coordinates.forEach(coordinate => {
          promises.push(self.getPlaceFromCoordinate(coordinate));
        });

        Promise.all(promises).then(places => {
          for (let i = 0; i < route.geometry.coordinates.length; i++) {
            let distance = self.calculateDistance(
              route.geometry.coordinates[i - 1],
              route.geometry.coordinates[i]
            );

            let movement = {
              address: places[i],
              coordinate: {
                x: route.geometry.coordinates[i][0],
                y: route.geometry.coordinates[i][1]
              },
              carTrackerId,
              date: new Date(),
              serialNumber: i,
              authCode: "SIMULATION",
              distance
            };

            convertedRoute.movements.push(movement);
            convertedRoute.coordinates.push(route.geometry.coordinates[i]);
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
    async start() {
      await this.initMap();

      let carTrackers = await this.getCarTrackersIds(this.config.vehicles);
      if (!carTrackers) {
        console.log("no cartrackers found");
        return;
      }

      carTrackers.forEach(carTracker => {
        this.startDriving(carTracker.id, 0);
      });
    },

    /**
     * make a single car start driving
     */
    async startDriving(carTrackerId, index, startPoint) {
      let origin = startPoint ? startPoint : this.getRandomPoint();
      let destination = this.getRandomPoint(origin);

      let mapboxRoute = await this.getRoute(origin, destination);
      if (!mapboxRoute) return;

      let convertedRoute = await this.convertRoute(
        mapboxRoute,
        carTrackerId,
        destination,
        index
      );

      let calculatedRoute = this.calculateRoute(convertedRoute);

      // Start the animation.
      this.animate(calculatedRoute);
    },

    /**
     * calculates all points of a route with turf library
     */
    calculateRoute(converted) {
      let self = this;

      converted.point = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: converted.coordinates[0]
            }
          }
        ]
      };

      converted.route = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: converted.coordinates
            }
          }
        ]
      };

      let lineDistance = turf.lineDistance(
        converted.route.features[0],
        "kilometers"
      );

      let arc = [];

      // Number of steps to use in the arc and animation, more steps means
      // a smoother arc and animation, but too many steps will result in a
      // low frame rate
      converted.steps = converted.duration;

      if (this.config.extremeSpeed) converted.steps = 200;

      // Draw an arc between the `origin` & `destination` of the two points
      for (let i = 0; i < lineDistance; i += lineDistance / converted.steps) {
        var segment = turf.along(converted.route.features[0], i, "kilometers");
        arc.push(segment.geometry.coordinates);
      }

      // Update the route with calculated arc coordinates
      converted.route.features[0].geometry.coordinates = arc;

      // Used to increment the value of the point measurement against the route.
      converted.counter = 0;

      let pointName = converted.index + "point" + converted.carTrackerId;
      let routeName = converted.index + "route" + converted.carTrackerId;
      let previousPointName =
        converted.index - 1 + "point" + converted.carTrackerId;
      let previousRouteName =
        converted.index - 1 + "route" + converted.carTrackerId;

      if (
        self.map.getSource(previousPointName) &&
        self.map.getLayer(previousPointName)
      ) {
        self.map.removeLayer(previousPointName);
        self.map.removeSource(previousPointName);
      }

      if (
        self.map.getSource(previousRouteName) &&
        self.map.getLayer(previousRouteName)
      ) {
        self.map.removeLayer(previousRouteName);
        self.map.removeSource(previousRouteName);
      }

      // Add a source and layer displaying a point which will be animated in a circle.
      self.map.addSource(routeName, {
        type: "geojson",
        data: converted.route
      });

      self.map.addSource(pointName, {
        type: "geojson",
        data: converted.point
      });

      self.map.addLayer({
        id: pointName,
        source: pointName,
        type: "symbol",
        layout: {
          "icon-image": "car-15",
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        }
      });

      if (self.config.showRoutes) {
        self.map.addLayer({
          id: routeName,
          source: routeName,
          type: "line",
          paint: {
            "line-width": 2,
            "line-color": "#007cbf"
          }
        });
      }

      return converted;
    },

    /**
     * Post movements to the register system
     */
    sendMovements(movements) {
      return new Promise((resolve, reject) => {
        if (!movements || !Array.isArray(movements)) {
          reject(null);
          return;
        }

        this.axiosMovementRegistration
          .post("movement", movements)
          .then(() => resolve())
          .catch(err => {
            console.log("sendMovements() error: ", err);
            reject();
          });
      });
    },

    /**
    Calculate the distance in KM between 2 points (user to apply kilometer rate)
     */
    calculateDistance(coord1, coord2) {
      if (!coord1 || !coord2) return 0;

      var point1 = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: coord1
        }
      };
      var point2 = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: coord2
        }
      };

      var points = {
        type: "FeatureCollection",
        features: [point1, point2]
      };

      return turf.distance(point1, point2, "kilometers");
    },

    /**
     * Returns carTrackers from bill admin
     */
    getCarTrackersIds(count) {
      return new Promise(resolve => {
        this.axiosBillAdministration
          .get("cartracker/notdeleted")
          .then(res => {
            resolve(res.data);
          })
          .catch(err => {
            console.log("getCarTrackers() error: ", err);
            resolve(null);
          });
      });
    },

    /**
     * Initialize mapbox map
     */
    initMap() {
      return new Promise((resolve, reject) => {
        let self = this;

        mapboxgl.accessToken = self.accessToken;

        self.map = new mapboxgl.Map(self.mapConfig);

        self.map.on("load", () => {
          resolve();
        });
      });
    },

    animate(converted) {
      let self = this;

      // Update point geometry to a new position based on self.counter denoting
      // the index to access the arc.
      converted.point.features[0].geometry.coordinates =
        converted.route.features[0].geometry.coordinates[converted.counter];

      // Calculate the bearing to ensure the icon is rotated to match the route arc
      // The bearing is calculate between the current point and the next point, except
      // at the end of the arc use the previous point and the current point

      let lng =
        converted.route.features[0].geometry.coordinates[
          converted.counter >= converted.steps
            ? converted.counter - 1
            : converted.counter
        ];
      let lat =
        converted.route.features[0].geometry.coordinates[
          converted.counter >= converted.steps
            ? converted.counter
            : converted.counter + 1
        ];

      converted.point.features[0].properties.bearing = turf.bearing(
        turf.point(lng),
        turf.point(lat)
      );

      // Update the source with this new data.
      let source = converted.index + "point" + converted.carTrackerId;
      self.map.getSource(source).setData(converted.point);

      // Request the next frame of animation so long the end has not been reached.
      if (converted.counter < converted.steps - 2) {
        converted.animation = requestAnimationFrame(() => {
          self.animate(converted);
        });
      } else {
        // save movement to database (movementregistration)
        self.sendMovements(converted.movements).catch(() => {});

        converted.index++;

        self.startDriving(
          converted.carTrackerId,
          converted.index,
          converted.destination
        );
      }

      converted.counter = converted.counter + 1;
    },

    checkBsn(bsn) {
      axios
        .get("/ownercredentials/" + bsn)
        .then(() => {
          let user = {
            email: null,
            password: null,
            bsn: bsn
          };

          this.register(user);
        })
        .catch(err => {
          console.log("user not found" + err);
        });
    },

    register(user) {
      user.email = "adasd@Dasd.bl";
      user.password = "123";

      //todo: post naar accountdriver backend user aanmaken
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

      this.axiosMovementRegistration = axios.create({
        baseURL: "http://192.168.25.102:8080/MovementRegistration/",
        timeout: 10000
      });

      this.axiosBillAdministration = axios.create({
        // baseURL: "http://localhost:8080/BillAdministration/",
        baseURL: "http://192.168.25.101:8080/BillAdministration/",
        headers: {
          "x-api": "SIMULATION"
        },
        timeout: 10000
      });
    }
  },

  async mounted() {
    await this.initMap();
    this.initAxios();

    // this.start();
  }
};
</script>

<style>
.fullscreen {
  width: 100%;
  height: 100%;
  position: relative;
}

.configBtn {
  position: absolute;
  top: 20px;
  left: 20px;
}

#map {
  position: absolute;
}

input[type="number"] {
  width: 50%;
  padding: 10px;
  font-size: 15px;
}

button {
  padding: 10px;
  margin-top: 10px;
}

.toolbox {
  text-align: center;
  z-index: 1;
  padding: 10px;
  width: 200px;
  left: 20px;
  top: 70px;
  background: white;
  position: absolute;
}
</style>

