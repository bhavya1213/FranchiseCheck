require([
    "esri/Map",
    "esri/views/MapView",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/PopupTemplate",
    "esri/geometry/Point",
    "esri/widgets/Home",
    "esri/widgets/ScaleBar",
    "esri/widgets/Search",
    "esri/widgets/Zoom",
    "esri/widgets/Locate"
], function (Map, MapView, Graphic, GraphicsLayer, SimpleMarkerSymbol, PopupTemplate, Point, Home, ScaleBar, Search, Zoom, Locate) {

    // Create map
    const map = new Map({
        basemap: "streets-navigation-vector"
    });

    // Create map view
    const view = new MapView({
        container: "mapViewDiv",
        map: map,
        center: [-74.006, 40.7128], // New York City default
        zoom: 10,
        constraints: {
            minZoom: 3,
            maxZoom: 18,
        },
        ui: {
            components: [] // Remove default UI components to add custom ones
        }
    });

    // Create graphics layer for markers
    const markersLayer = new GraphicsLayer({
        title: "Location Markers"
    });
    map.add(markersLayer);

    // Create graphics layer for current location
    const currentLocationLayer = new GraphicsLayer({
        title: "Current Location"
    });
    map.add(currentLocationLayer);

    // Add Search Widget
    const searchWidget = new Search({
        view: view,
        allPlaceholder: "Search for places or addresses",
        includeDefaultSources: true
    });
    view.ui.add(searchWidget, {
        position: "top-right",
        index: 0
    });

    // Add Home Widget
    const homeWidget = new Home({
        view: view
    });
    view.ui.add(homeWidget, "top-left");

    // Add Zoom Widget
    const zoomWidget = new Zoom({
        view: view
    });
    view.ui.add(zoomWidget, "top-left");

    // Add Locate Widget (Current Location)
    const locateWidget = new Locate({
        view: view,
        graphic: new Graphic({
            symbol: new SimpleMarkerSymbol({
                style: "circle",
                color: [0, 150, 255, 0.8],
                size: "15px",
                outline: {
                    color: [255, 255, 255],
                    width: 2
                }
            })
        }),
        scale: 3000 // Set zoom level when location is found
    });
    view.ui.add(locateWidget, "top-left");

    // Add Scale Bar
    const scaleBar = new ScaleBar({
        view: view
    });
    view.ui.add(scaleBar, "bottom-left");

    // UI Elements (optional - for status display)
    const loadingOverlay = document.getElementById('loading-overlay');
    const statusText = document.getElementById('statusText');
    const notificationContainer = document.getElementById('notification-container');

    // Enhanced current location function
    function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }

            showLoading(true);
            updateStatus('Getting your current location...');

            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000 // Cache for 1 minute
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;

                    // Clear previous current location markers
                    currentLocationLayer.removeAll();

                    // Create point for current location
                    const currentPoint = new Point({
                        longitude: longitude,
                        latitude: latitude
                    });

                    // Create symbol for current location
                    const currentLocationSymbol = new SimpleMarkerSymbol({
                        style: "circle",
                        color: [0, 150, 255, 0.8],
                        size: "20px",
                        outline: {
                            color: [255, 255, 255],
                            width: 3
                        }
                    });

                    // Create popup template for current location
                    const currentLocationPopup = new PopupTemplate({
                        title: "Your Current Location",
                        content: `
                            <div style="padding: 8px;">
                                <p><strong>Coordinates:</strong> ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</p>
                                <p><strong>Accuracy:</strong> ±${Math.round(accuracy)} meters</p>
                                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                        `
                    });

                    // Create graphic for current location
                    const currentLocationGraphic = new Graphic({
                        geometry: currentPoint,
                        symbol: currentLocationSymbol,
                        attributes: {
                            type: 'current-location',
                            lat: latitude,
                            lng: longitude,
                            accuracy: accuracy,
                            timestamp: new Date().toISOString()
                        },
                        popupTemplate: currentLocationPopup
                    });

                    // Add to current location layer
                    currentLocationLayer.add(currentLocationGraphic);

                    // Zoom to current location
                    view.goTo({
                        center: [longitude, latitude],
                        zoom: 15
                    }).catch(err => {
                        console.warn('Could not zoom to current location:', err);
                    });

                    updateStatus(`Current location found (±${Math.round(accuracy)}m accuracy)`);
                    showNotification(`Current location found with ${Math.round(accuracy)}m accuracy`, 'success');
                    showLoading(false);

                    resolve({
                        latitude,
                        longitude,
                        accuracy,
                        point: currentPoint
                    });
                },
                (error) => {
                    showLoading(false);
                    let errorMessage = 'Unable to get current location';

                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'Location access denied by user';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'Location information unavailable';
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'Location request timed out';
                            break;
                    }

                    updateStatus(errorMessage);
                    showNotification(errorMessage, 'error');
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    }

    // Utility functions - Enhanced notification system
    function showNotification(type, message) {
        if (!notificationContainer) return;

        const notification = document.createElement('div');
        notification.className = `p-4 rounded-md shadow-lg ${type === 'error' ? 'bg-red-100 border-l-4 border-red-500 text-red-700' : 'bg-green-100 border-l-4 border-green-500 text-green-700'}`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-3"></i>
                <div>${message}</div>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-auto text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        notificationContainer.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    function showLoading(show) {
        if (loadingOverlay) {
            loadingOverlay.classList.toggle('hidden', !show);
        }
    }

    function updateStatus(text) {
        if (statusText) {
            statusText.textContent = text;
        }
        console.log('Status:', text);
    }

    // Create marker symbol
    function createMarkerSymbol(status) {
        const colors = {
            'Approved': [0, 255, 0],      // Green
            'Rejected': [255, 0, 0],    // Red
            'Process': [255, 165, 0],   // Orange
            'default': [0, 100, 255]    // Blue
        };

        const color = colors[status] || colors['default'];

        return new SimpleMarkerSymbol({
            style: "circle",
            color: color,
            size: "12px",
            outline: {
                color: [255, 255, 255],
                width: 0.5
            }
        });
    }

    // Create popup template
    function createPopupTemplate() {
        return new PopupTemplate({
            title: "{name}",
            content: `
                <div style="padding: 8px;">
                    <p><strong>Address:</strong> {address}</p>
                    <p><strong>Status:</strong> <span style="
                        padding: 2px 8px; 
                        border-radius: 12px; 
                        font-size: 12px; 
                        background: {status_color}; 
                        color: white;
                    ">{status}</span></p>
                    <p><strong>Coordinates:</strong> {lat}, {lng}</p>
                    <p><strong>Created:</strong> {created_at}</p>
                </div>
            `
        });
    }

    // Load locations from API
    async function loadLocations() {
        showLoading(true);
        updateStatus('Loading locations from database...');

        try {
            // Replace with your actual API endpoint
            const response = await fetch('/api/locations');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const locations = await response.json();

            if (!Array.isArray(locations)) {
                throw new Error('Invalid response format');
            }

            // Clear existing markers
            markersLayer.removeAll();

            // Add markers for each location
            const graphics = locations.map(location => {
                const point = new Point({
                    longitude: parseFloat(location.lng),
                    latitude: parseFloat(location.lat)
                });

                const symbol = createMarkerSymbol(location.status);

                // Format date
                const createdDate = new Date(location.created_at).toLocaleDateString();

                // Status color for popup
                const statusColors = {
                    'Approved': '#10b981',
                    'Rejected': '#ef4444',
                    'Process': '#f59e0b',
                    'default': '#3b82f6'
                };

                const graphic = new Graphic({
                    geometry: point,
                    symbol: symbol,
                    attributes: {
                        id: location.id,
                        name: location.name || 'Unnamed Location',
                        address: location.address || 'No address provided',
                        status: location.status || 'unknown',
                        status_color: statusColors[location.status] || statusColors['default'],
                        lat: location.lat,
                        lng: location.lng,
                        created_at: createdDate
                    },
                    popupTemplate: createPopupTemplate()
                });

                return graphic;
            });

            // Add all graphics to the layer
            markersLayer.addMany(graphics);

            // Zoom to extent of all markers if there are any
            if (graphics.length > 0) {
                view.goTo(graphics).catch(err => {
                    console.warn('Could not zoom to markers:', err);
                });
            }

            updateStatus(`Loaded ${locations.length} locations`);
            showNotification(`Successfully loaded ${locations.length} location markers`);

        } catch (error) {
            console.error('Error loading locations:', error);
            updateStatus('Error loading locations');
            showNotification(`Failed to load locations: ${error.message}`, 'error');
        }

        showLoading(false);
    }

    // Event Listeners

    // Listen for locate widget events
    locateWidget.on("locate", function (event) {
        console.log("Location found:", event);
        updateStatus(`Location found with ${Math.round(event.position.coords.accuracy)}m accuracy`);
    });

    locateWidget.on("locate-error", function (event) {
        console.error("Locate error:", event);
        updateStatus("Could not find current location");
        showNotification("Could not find current location", 'error');
    });

    // Listen for search widget events
    searchWidget.on("search-complete", function (event) {
        console.log("Search completed:", event);
        if (event.results && event.results.length > 0) {
            const result = event.results[0].results[0];
            if (result) {
                updateStatus(`Search result: ${result.name}`);
            }
        }
    });

    // Auto-load locations when map is ready
    view.when(() => {
        console.log('Map is ready');
        updateStatus('Map ready - loading locations...');

        // Automatically load locations
        loadLocations();

        // Optionally get current location on startup
        // Uncomment the next line if you want to auto-locate user on startup
        // getCurrentLocation().catch(err => console.log('Auto-locate failed:', err));
    });

    // Handle map click events
    view.on("click", function (event) {
        view.hitTest(event).then(function (response) {
            if (response.results.length > 0) {
                const graphic = response.results[0].graphic;
                if (graphic && graphic.attributes) {
                    console.log('Clicked location:', graphic.attributes);
                }
            }
        });
    });

    // Optional: Refresh locations periodically (every 5 minutes)
    // Uncomment if you want automatic refresh
    
    setInterval(() => {
        console.log('Refreshing locations...');
        loadLocations();
    }, 5 * 60 * 1000); // 5 minutes

    // Expose functions globally for external access
    window.mapFunctions = {
        getCurrentLocation,
        loadLocations,
        goToLocation: (lat, lng, zoom = 15) => {
            view.goTo({
                center: [lng, lat],
                zoom: zoom
            });
        }
    };

});