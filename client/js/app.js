define([
    'backbone',
    'marionette',
    'paginator',
    'build/templates',
    'masonry',
    'bootstrap',
    'owl',
    'leaflet',
    'tileLayer',
    'chosen',
    'leafletLabel'
], function(
    Backbone,
    Marionette,
    paginator,
    templates,
    Masonry,
    owl,
    Leaflet,
    TileLayer,
    leafletLabel
) {
    var app = new Marionette.Application(),
        router;

    app.addRegions({
        navRegion: '#header',
        mainRegion: '#content-area',
        footerRegion: '#footer',
        mapRegion: '#map-region'
    });

    // Models
    var Park = Backbone.Model.extend({
        initialize: function (params) {
          var self = this;
          this.park_slug = params.park_slug   
          var thumbnail_data = self.get("images");
        },
        defaults: {
            'title': ''
        },
        url: function() {
            return window.location.origin + '/parks/search/?no_map=true&slug=' + this.park_slug;
        },
        parse: function (response) {
          var attributes = {};
          _.each(response.parks, function(attribute, key) {
            _.each(attribute, function(attribute, key) {
              attributes[key] = attribute;
            })
          });
          return attributes;
        }
    });
    
    var SearchModel = Backbone.Model.extend({
        url: function() {
            return window.location.origin + '/parks/get_neighborhoods_and_activities_list/';
        },
        parse: function(response) {
            var data = {'neighborhoods': [], 'activities': [], 'featured_parks': [], 'hero_images': []};
            _.each(response.neighborhoods, function(neighborhood) {
                data.neighborhoods.push({'id': neighborhood.id, 'name': neighborhood.name});
            });
            _.each(response.activities, function(activity) {
                data.activities.push({'id': activity.id, 'name': activity.name});
            });
            _.each(response.featured_parks, function(featured_park) {
                data.featured_parks.push({'id': featured_park.id, 'name': featured_park.name, 'url': featured_park.url, 'images': featured_park.images });
            });
            _.each(response.hero_images, function(hero_image) {
                data.hero_images.push({'src': hero_image.src, 'large_src': hero_image.large_src });
            });
            return data;
        } 
    });

    var ParksCollection = Backbone.PageableCollection.extend({
        model: Park,
        initialize: function(params) {
            this.queryString = params.queryString;
        },
        url: function() {
            var search_url = 'parks/search/?' + this.queryString;
            return search_url;
        },
        parse: function(response) {
            if (!response) {
                alert('no data for that search!');
            }

            var parks = _.map(_.values(response.parks), function(park) {
                return new Park(park);
            });
            return parks;
        },
        queryParams: {
          pageSize: null,
          totalPages: "pages"
        }
    });

    var MapView = Marionette.ItemView.extend({
      initialize: function() {
        var self = this;
        this.listenTo(app, 'map:toggle', this.toggle)
        this.listenTo(app, 'park:changed', this.set_bbox);
        this.listenTo(app, 'park:destroyed', function() { 
          self.visible=true;   
          self.toggle();
          return this; 
        });
        return this;
      },
      // events: {
      //   'click .parkgeom': 'navigate'
      // },
      // navigate: function(e) {
      //   console.log('backbone event: ', e);
      //   app.router.navigate("#/parks/" + e.target.feature.properties.slug + "/");
      // },
      id: 'map',
      visible: false,
      render: function() {
        var self = this;
        var boston = new L.LatLng(42.357778, -71.061667);
        this.map = L.map(this.el, {scrollWheelZoom: false, center: boston, zoom: 13});
        L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
            subdomains: 'abcd',
            minZoom: 0,
            maxZoom: 18
        }).addTo(this.map);
        
        self.style = {
            clickable: true,
            color: "#00c800",
            weight: 0,
            opacity: 1,
            fillColor: "#00DC00",
            fillOpacity: 0.1,
            className: 'parkgeom'
          };

        self.hoverStyle = {
            "fillOpacity": 1
        };
        var geojsonURL = 'http://beta.bostongreenspace.org:8080/parks/{z}/{x}/{y}.json';
        self.geojsonTileLayer = new L.TileLayer.GeoJSON(geojsonURL, {
                clipTiles: true,
                unique: function (feature) { 
                    this.slug = feature.properties.slug;
                    return feature.id;
                }
            }, {
                style: function(feature, layer) {

                  return self.style;  
                },
                reuseTiles: true,
                onEachFeature: function (feature, layer) {
                    this.slug = feature.properties.slug;
                    layer.slug = feature.properties.slug;
                    if (!(layer instanceof L.Point)) {
                        layer.on('mouseover', function () {
                            layer.setStyle(self.hoverStyle);
                        });
                        layer.on('mouseout', function () {
                            layer.setStyle(self.style);
                        });
                    }
 
                    layer.bindLabel(feature.properties.name);

 
                    if (feature.properties) {
                      layer.on("click", function(e) {
                        console.log("leaflet listener: ", e);
                        app.router.navigate("#/parks/" + e.target.slug + "/");
                      });
                    }
                }
            }
          );

        self.map.addLayer(self.geojsonTileLayer);
      
        return this;
      },
      set_style: function(highlightID) {
        var self = this;
        var highlightStyle = {
            clickable: true,
            color: "#00c800",
            weight: 0,
            opacity: 1,
            fillColor: "#00DC00",
            fillOpacity: 0.9
          };

        var restyle = function(callback) {
          self.geojsonTileLayer.geojsonLayer.eachLayer(function (layer) {
            self.geojsonTileLayer.geojsonLayer.resetStyle(layer);
            layer.on('mouseover', function () {
                layer.setStyle(self.hoverStyle);
            });
            layer.on('mouseout', function () {
                layer.setStyle(self.style);
            });
            if(layer.feature.properties.id == highlightID) {
                layer.setStyle(highlightStyle) 
                layer.on('mouseout', function () {
                  layer.setStyle(highlightStyle);
                });
              }
          });
        
          callback();
        };

        restyle(function() {
          // self.geojsonTileLayer.bringToBack();
        });
      },
      add_points: function(id) {
        var self = this;
        // clear out existing markers.
        if (self.activity_markers) {
          self.map.removeLayer(self.activity_markers);
        }

        //FIXME: I don't know the best design approach to lazy-loading relational 1:m models
        var url = window.location.origin + '/parks/' + id + '/facilities/';

        $.get(url, function(response) {
            var myStyle = {
                "color": "#ff7800",
                "weight": 5,
                "opacity": 0.65
            };
          
          self.activity_markers = L.geoJson(response, {
              style: myStyle,
              pointToLayer: function(feature, latlng) {
                return L.marker(latlng, {
                                      icon: L.divIcon({
                                          className: 'map-park-activity icon icon-' + feature.properties.activities[0].slug,
                                          iconAnchor: [12,12]
                                      })
                                  });
              },
              onEachFeature: function(feature, layer) {
                var activities = '<ul>';

                for (var i = 0, len = feature.properties.activities.length; i <len; i++) {
                  activities += '<li>' +feature.properties.activities[i].name + '</li>';
                }
                activities += '</ul';
                layer.bindPopup(activities)
              }
            }).addTo(self.map);

          self.geojsonTileLayer.on('load', function() {
            self.activity_markers.bringToFront();
          });

        });
      },
      set_bbox: function(geos_obj) {
        var self = this;
        var data = app.getRegion('mainRegion').currentView.model.attributes || geos_obj;
        
        if (data.bbox) {
          self.map.fitBounds([
                  [data.bbox[0][1], data.bbox[0][0]],
                            [data.bbox[1][1], data.bbox[1][0]]
                          ]);
          self.add_points(data.id);
          self.geojsonTileLayer.on('load', function() {
            self.set_style(data.id);
          
          });
        }

      },
      toggle: function(chosenState) {
        var self = this;
        if (self.visible) {
          app.getRegion('mapRegion').currentView.$el.slideUp();
          self.visible = false;
        } else {
          this.$el.hide().slideDown(function() {
            self.map.invalidateSize();
            self.set_bbox();
          });
          self.visible = true;
        }
      }
    });

    // Views
    var HeaderView = Marionette.ItemView.extend({
        events: {
            'click #nav-about': 'goToAbout',
            'click #nav-mission': 'goToMission',
            'click #nav-index': 'goToIndex',
            'click #nav-contact': 'goToContact',
            'click #toggle': function() {
              app.trigger('map:toggle');
            },
        },
        template: templates['client/templates/header.hbs'],
        tagName: 'div',
        className: 'header',
        goToAbout: function(evt) {
            Backbone.history.navigate('about', {'trigger': true});
        },
        goToMission: function(evt){
            Backbone.history.navigate('mission', {'trigger': true});
        },
        goToContact: function(evt) {
            Backbone.history.navigate('contact', {'trigger': true});
        },
        goToIndex: function(evt) {
            Backbone.history.navigate('', {'trigger': true});
        }
    });

    var SearchView = Marionette.ItemView.extend({
        template:templates['client/templates/search.hbs'],
        tagName: 'div',
        className: 'search-page',
        events: {
            'click .gobutton': 'doSearch'
        },
        doSearch: function() {
            var neighborhood_id = $('#neighborhoods option:selected').val(),
                activity_id = $('#facility__activity option:selected').val(),
                search_url = [
                    'results/',
                    'no_map=true',
                    (neighborhood_id ? '&neighborhoods=' + neighborhood_id.toString() : ''),
                    (activity_id ? '&facility__activity=' + activity_id.toString() : '')
                ].join('');
            Backbone.history.navigate(search_url, {'trigger': true});
        },
        onShow: function() {
          $(".parkfilter").chosen()
        }
    });

    var FooterView = Marionette.ItemView.extend({
        template: templates['client/templates/footer.hbs'],
        tagName: 'div',
        className: 'footer'
    });

    var AboutView = Marionette.ItemView.extend({
        template: templates['client/templates/about.hbs'],
        tagName: 'div',
        className: 'about'
    });

    var MissionView = Marionette.ItemView.extend({
        template: templates['client/templates/mission.hbs'],
        tagName: 'div',
        className: 'mission'
    });

    var ContactView = Marionette.ItemView.extend({
        template: templates['client/templates/contact.hbs'],
        tagName: 'div',
        className: 'contact'
    });

    var ParkView = Marionette.ItemView.extend({
        events: {
          'click #toggle': function() {
            app.trigger('map:toggle');
          }
        },
        initialize: function() {
          this.listenTo(this,"show", function() {
            app.trigger("park:changed", this);
          });

          return this;
        },
        model: Park,
        template: templates['client/templates/park.hbs'],
        tagName: 'div',
        className: 'detail',
        onShow: function() {
          
            var self = this;
            self.$('#carousel-images-container').owlCarousel({
              autoPlay: 5000, //Set AutoPlay to 3 seconds
              items: 1,
              lazyLoad: true,
              paginationSpeed: 1500,
              slideSpeed: 1500,
              stopOnHover: true,
              singleItem: true
            });

            self.$('#orbs').owlCarousel({
              autoPlay: 5000, //Set AutoPlay to 3 seconds
              items : 4,
              navigation: true,
              slideSpeed: 1500,
              paginationSpeed: 1500,
              itemsDesktop : [1199,3],
              itemsDesktopSmall : [979,3],
              stopOnHover: true
            });

            self.$('#nearby').owlCarousel({
              autoPlay: 2000, //Set AutoPlay to 3 seconds
              items : 3,
              navigation: true,
              paginationSpeed: 1500,
              slideSpeed: 1500,
              itemsDesktop : [1199,3],
              itemsDesktopSmall : [979,3],
              stopOnHover: true
            });

            self.$('#recommended').owlCarousel({
              autoPlay: 5000, //Set AutoPlay to 3 seconds
              items : 3,
              navigation: true,
              paginationSpeed: 1500,
              slideSpeed: 1500,
              itemsDesktop : [1199,3],
              itemsDesktopSmall : [979,3],
              stopOnHover: true
            });

            self.$('[data-toggle="tooltip"]').tooltip();


        }
    });

    var ResultItemView = Marionette.ItemView.extend({
        initialize: function() {
          var images = this.model.get("images");
          if (images[0]) {
            $(this.el).css("width", images[0].width).css("height", images[0].height);
          }
        },
        template: templates['client/templates/resultItem.hbs'],
        className: 'result',
        onRender: function() {
          var self = this;
        }
    }); 

    var ResultsView = Marionette.CompositeView.extend({
        events: {
          'click #previous-button': 'getLastPage',
          'click #next': 'getNextPage'
        },
        collection: ParksCollection,
        initialized: false,
        getNextPage: function(evnt) {
          var that = this;
          this.collection.getNextPage({remove:false, success: function() { }});
          this.initialized = true;
          
        },
        getLastPage: function(evnt) {
          this.collection.getLastPage();
        },
        template: templates['client/templates/results.hbs'],
        childView: ResultItemView,
        tagname: 'div',
        className: 'results',        
        onShow: function () {
          var self = this;

          $('#loading').css("display", "none");

          self.msnry = new Masonry(self.el, {
            itemSelector: '.result',
            columnWidth: '.grid-sizer'
          }); 
        }, 
        onAddChild: function (childView) {
          if(this.initialized) {
            this.msnry.appended(childView.el);  
          }
        }
    });

    var ResultsLayout = Backbone.Marionette.LayoutView.extend({
      onShow: function() {
        this.getRegion('results').show(new ResultsView({'collection': this.collection}))
      },
      events: {
        "click #next": "getNext"
      },
      getNext: function () {
        var that = this;
        this.results.currentView.collection.getNextPage({remove:false, success: function() { }});
        this.results.currentView.initialized = true;

      },
      className: "results-layout",
      collection: ParksCollection,
      template: templates['client/templates/all_results.hbs'],
      regions: {
        results: "#results",
        next: "#next"
      }
    });

    app.Router = Backbone.Router.extend({
        routes: {
            '': 'home',
            'about': 'about',
            'mission': 'mission',
            'contact': 'contact',
            'results/:queryString': 'results',
            'parks/:park_slug/': 'park',
            'parks/:park_slug': 'park'

        },
        home: function() {
            var searchModel = new SearchModel();
            var searchView =
            searchModel.once('sync', function() {
              app.getRegion('mainRegion').show(new SearchView({'model': searchModel}));
              $('#loading').css("display", "none");
              $('#featured').owlCarousel({
                  navigation: true,
                  items : 3,
                  itemsDesktop : [1199,3],
                  itemsDesktopSmall : [979,3],
                  stopOnHover: true
               }); 

               $('#carousel-images-container').owlCarousel({
                  autoPlay : true, // Show next and prev buttons
                  slideSpeed : 300,
                  paginationSpeed : 400,
                  singleItem: true
                  // items : 2 //10 items above 1000px browser width
                  // itemsDesktop : [1000,1] //5 items between 1000px and 901px
               });
            });
            searchModel.fetch();

        },
        about: function() {
          $('#loading').css("display", "none");
            app.getRegion('mainRegion').show(new AboutView());

        },
        mission: function () {
            app.getRegion('mainRegion').show(new MissionView());
            $('#loading').css("display", "none");
        },
        contact: function () {
            app.getRegion('mainRegion').show(new ContactView());
            $('#loading').css("display", "none");
        },
        results: function(queryString) {
            var results = new ParksCollection({'queryString': queryString});

            results.fetch({'success': function() {
              app.getRegion('mainRegion').show(new ResultsLayout({'collection': results}));
            }});
        },
        park: function (park_slug, map) {
            var park = new Park({'park_slug': park_slug});
            park.fetch({'success': function() {
              if(map) {
                app.trigger("map:toggle")
                map = true;
              } else {
                map = false;
              }
              $('#loading').css("display", "none");
              var parkView = new ParkView({'model': park });
              app.getRegion('mainRegion').show(parkView);
            }});
        }
    });


    app.addInitializer(function(options) {
        app.getRegion('navRegion').show(new HeaderView());
        app.getRegion('footerRegion').show(new FooterView());
        app.getRegion('mapRegion').show(new MapView());

        app.router = new app.Router();
        app.router.on('route:home route:about route:mission route:contact route:results', function() {
          app.trigger("park:destroyed")
        });
        app.execute('setRouter', app.router);
        Backbone.history.start();
    });

    return {
        startModule: function(done) {
            app.start({});
        }
    };
});

