// Initialize the ArcGIS map
require([
    "esri/Map",
    "esri/views/MapView",
    "esri/widgets/BasemapToggle",
    "esri/widgets/BasemapGallery",
    "esri/widgets/Expand",
    "esri/widgets/Search",
    "esri/widgets/Locate",
    "esri/widgets/ScaleBar",
    "esri/widgets/Zoom",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/PopupTemplate"
], function (Map, MapView, BasemapToggle, BasemapGallery, Expand, Search, Locate, ScaleBar, Zoom, Graphic, GraphicsLayer, SimpleMarkerSymbol, PopupTemplate) {

    // Create the map
    const map = new Map({
        basemap: "streets-navigation-vector" // You can change this to other basemaps
    });

    // Create a graphics layer for our markers
    const graphicsLayer = new GraphicsLayer();
    map.add(graphicsLayer);

    // Create the MapView
    const view = new MapView({
        container: "mapViewDiv",
        map: map,
        center: [-98.5795, 39.8283],
        zoom: 4,
        ui: {
            components: []
        }
    });

    // Add widgets
    view.ui.add(new Zoom({ view: view }), "top-left");
    view.ui.add(new ScaleBar({ view: view }), "bottom-left");

    // Add search widget
    const searchWidget = new Search({ view: view });
    view.ui.add(searchWidget, {
        position: "top-right",
        index: 0
    });

    // Add locate widget
    const locateWidget = new Locate({ view: view });
    view.ui.add(locateWidget, {
        position: "top-left",
        index: 1
    });

    // Add basemap gallery in an expandable widget
    const basemapGallery = new BasemapGallery({
        view: view
    });

    const bgExpand = new Expand({
        view: view,
        content: basemapGallery,
        expandIconClass: "esri-icon-basemap",
        expandTooltip: "Basemap Gallery"
    });

    view.ui.add(bgExpand, "top-right");

    // Function to get URL query parameters
    function getQueryParams() {
        const params = {};
        window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, (str, key, value) => {
            params[key] = value;
        });
        return params;
    }

    // Function to get marker color based on status
    function getMarkerColor(status) {
        switch (status.toLowerCase()) {
            case 'approved':
                return [56, 168, 0]; // Green
            case 'pending':
            case 'in process':
                return [255, 255, 153]; // Yellow
            case 'rejected':
                return [226, 50, 40]; // Red
            default:
                return [226, 119, 40]; // Orange (default)
        }
    }

    // Function to add marker to map
    function addMarkerToMap(location) {
        // Get color based on status
        const color = getMarkerColor(location.status);

        // Create a symbol for the marker
        const markerSymbol = new SimpleMarkerSymbol({
            color: color,
            outline: {
                color: [255, 255, 255], // White
                width: 1
            }
        });

        // Create a popup template
        const popupTemplate = new PopupTemplate({
            title: location.name || "No name",
            content: `
                <b>${location.name || "No name"}</b><br>
                ${location.address || "No address"}<br>
                <strong>Status:</strong> ${location.status || "Unknown"}<br>
                <small>Added: ${new Date(location.created_at).toLocaleDateString()}</small>
            `
        });

        // Create a point for the marker
        const point = {
            type: "point",
            longitude: location.lng,
            latitude: location.lat
        };

        // Create a graphic for the marker
        const graphic = new Graphic({
            geometry: point,
            symbol: markerSymbol,
            popupTemplate: popupTemplate
        });

        // Add the graphic to the graphics layer
        graphicsLayer.add(graphic);

        return graphic;
    }

    // Function to add location to panel
    function addLocationToPanel(location) {
        const panel = document.getElementById('locationsPanel');
        const card = document.createElement('div');

        // Add status-based border color
        let borderColor = 'border-gray-300';
        switch (location.status.toLowerCase()) {
            case 'approved':
                borderColor = 'border-green-500';
                break;
            case 'pending':
            case 'in process':
                borderColor = 'border-yellow-500';
                break;
            case 'rejected':
                borderColor = 'border-red-500';
                break;
        }

        card.className = `bg-white p-4 rounded shadow-sm min-w-[200px] flex-1 hover:shadow-md transition-shadow cursor-pointer border-l-4 ${borderColor}`;
        card.innerHTML = `
            <h3 class="text-lg font-semibold mb-1">${location.name}</h3>
            <p><strong>Address:</strong> ${location.address}</p>
            <p><strong>Status:</strong> 
                <span class="px-2 py-1 rounded text-xs ${location.status.toLowerCase() === 'approved' ? 'bg-green-100 text-green-800' :
                (location.status.toLowerCase() === 'pending' || location.status.toLowerCase() === 'in process') ? 'bg-yellow-100 text-yellow-800' :
                    location.status.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
            }">
                    ${location.status}
                </span>
            </p>
            <p class="text-sm text-gray-600 mt-2">Coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</p>
        `;

        // When card is clicked, zoom to the location
        card.addEventListener('click', () => {
            view.goTo({
                center: [location.lng, location.lat],
                zoom: 15
            }).then(() => {
                // Open the popup for the marker
                const graphics = graphicsLayer.graphics.filter(g => {
                    return g.geometry.longitude === location.lng &&
                        g.geometry.latitude === location.lat;
                });
                if (graphics.length > 0) {
                    view.popup.open({
                        features: [graphics[0]],
                        location: graphics[0].geometry
                    });
                }
            });
        });

        panel.appendChild(card);
    }

    // Load and display all locations
    async function loadLocations() {
        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            document.getElementById('locationsPanel').classList.remove('hidden');
            document.getElementById('locationsPanel').style.display = 'block';

            const response = await fetch('/api/locations');
            const locations = await response.json();

            if (locations.length === 0) {
                document.getElementById('locationsPanel').innerHTML = '<p class="text-gray-500">No locations found.</p>';
                return;
            }

            let highlightedGraphic = null;

            locations.forEach(location => {
                addMarkerToMap(location);
                addLocationToPanel(location);

                // Check for highlight
                if (highlightId && location.id.toString() === highlightId.toString()) {
                    highlightedGraphic = {
                        lat: location.lat,
                        lng: location.lng
                    };
                }
            });

            // Zoom
            if (highlightedGraphic) {
                await view.goTo({
                    center: [highlightedGraphic.lng, highlightedGraphic.lat],
                    zoom: 15
                });

                // Try to open popup
                const graphic = graphicsLayer.graphics.find(g =>
                    g.attributes && g.attributes.id == highlightId
                );

                if (graphic) {
                    view.popup.open({
                        features: [graphic],
                        location: graphic.geometry
                    });
                }
            } else {
                const extent = {
                    xmin: Math.min(...locations.map(loc => loc.lng)),
                    ymin: Math.min(...locations.map(loc => loc.lat)),
                    xmax: Math.max(...locations.map(loc => loc.lng)),
                    ymax: Math.max(...locations.map(loc => loc.lat)),
                    spatialReference: { wkid: 4326 }
                };

                view.goTo({
                    target: extent,
                    padding: 50
                });
            }

        } catch (error) {
            console.error('Error loading locations:', error);

            const notification = document.createElement('div');
            notification.className = 'bg-red-100 border-l-4 border-red-500 text-red-700 p-4';
            notification.innerHTML = '<p>Failed to load locations. Please try again later.</p>';
            document.getElementById('notification-container').appendChild(notification);

            setTimeout(() => notification.remove(), 5000);
        } finally {
            document.getElementById('loading-overlay').classList.add('hidden');
        }
    }



    // When the view is ready, load the locations
    view.when(() => {
        loadLocations();
    });
});