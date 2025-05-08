// First load the ArcGIS API
window.dojoConfig = {
    async: true,
    packages: [
        {
            name: 'application',
            location: window.location.pathname.replace(/\/[^/]+$/, '') + '/js'
        }
    ]
};

// Global variables
let map, view, markerGraphic, locator;
let existingLocations = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Initialize map
    initMap();

    // Load settings and existing locations
    loadSettings();
    fetchExistingLocations();

    // Set up event listeners
    setupEventListeners();
});

// Initialize the ArcGIS map
function initMap() {
    require(["esri/Map", "esri/views/MapView", "esri/Graphic", "esri/geometry/Point"],
        function (Map, MapView, Graphic, Point) {
            try {
                // Create the map
                map = new Map({
                    basemap: "streets-navigation-vector"
                });

                // Create the view
                view = new MapView({
                    container: "location-map",
                    map: map,
                    center: [0, 20], // longitude, latitude
                    zoom: 2
                });

                // Create a graphic for the marker
                markerGraphic = new Graphic({
                    symbol: {
                        type: "simple-marker",
                        color: [226, 119, 40],
                        outline: {
                            color: [255, 255, 255],
                            width: 2
                        }
                    }
                });
                map.add(markerGraphic);

                // Map click handler
                view.on("click", function (event) {
                    const point = new Point({
                        longitude: event.mapPoint.longitude,
                        latitude: event.mapPoint.latitude
                    });

                    updateMapMarker(point);
                    updateFormCoordinates(point.latitude, point.longitude);
                    reverseGeocode(point);
                });

                // Initialize locator
                initLocator();
            } catch (error) {
                console.error("Map initialization error:", error);
                showNotification('error', 'Failed to initialize map');
            }
        },
        function (error) {
            console.error("ArcGIS module loading error:", error);
            showNotification('error', 'Failed to load map components');
        }
    );
}

// Initialize the locator service
function initLocator() {
    require(["esri/tasks/Locator"],
        function (Locator) {
            locator = new Locator({
                url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
            });
        },
        function (error) {
            console.error("Locator module loading error:", error);
        }
    );
}

// Load settings from localStorage
function loadSettings() {
    const savedDistance = localStorage.getItem('selectedDistance') || 5;
    document.getElementById('current-distance').textContent = `${savedDistance} miles`;
    return savedDistance;
}

// Fetch existing franchise locations
function fetchExistingLocations() {
    showLoading(true);
    // In a real app, this would be an API call to your backend
    fetch('/api/locations')
        .then(response => response.json())
        .then(locations => {
            existingLocations = locations.filter(loc => loc.lat && loc.lng);
            showLoading(false);
        })
        .catch(error => {
            console.error("Error fetching locations:", error);
            showLoading(false);
            showNotification('error', 'Failed to load existing locations');
        });
}

// Set up event listeners
function setupEventListeners() {
    // Address search button
    document.getElementById('search-address-btn').addEventListener('click', geocodeAddress);

    // Check feasibility button
    document.getElementById('check-feasibility-btn').addEventListener('click', checkFeasibility);

    // Address input suggestions
    const addressInput = document.getElementById('address');
    const suggestionsList = document.getElementById('suggestions-list');

    addressInput.addEventListener('input', handleAddressInput);
    addressInput.addEventListener('focus', handleAddressInput);

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!addressInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            suggestionsList.style.display = 'none';
        }
    });
}

// Handle address input for suggestions
function handleAddressInput() {
    const address = document.getElementById('address').value.trim();
    if (address.length < 3) {
        document.getElementById('suggestions-list').style.display = 'none';
        return;
    }

    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?f=json&text=${encodeURIComponent(address)}&maxSuggestions=5`)
        .then(response => response.json())
        .then(data => {
            const suggestions = data.suggestions || [];
            displaySuggestions(suggestions);
        })
        .catch(error => {
            console.error("Error getting suggestions:", error);
        });
}

// Display address suggestions
function displaySuggestions(suggestions) {
    const suggestionsList = document.getElementById('suggestions-list');
    suggestionsList.innerHTML = '';

    if (suggestions.length === 0) {
        suggestionsList.style.display = 'none';
        return;
    }

    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = suggestion.text;
        item.addEventListener('click', () => {
            document.getElementById('address').value = suggestion.text;
            suggestionsList.style.display = 'none';
            geocodeSuggestion(suggestion.magicKey, suggestion.text);
        });
        suggestionsList.appendChild(item);
    });

    suggestionsList.style.display = 'block';
}

// Geocode a selected suggestion
function geocodeSuggestion(magicKey, text) {
    showLoading(true);
    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(text)}&magicKey=${encodeURIComponent(magicKey)}&outFields=Addr_type`)
        .then(response => response.json())
        .then(data => {
            showLoading(false);
            if (data.candidates && data.candidates.length > 0) {
                const bestMatch = data.candidates[0];
                const location = {
                    lng: bestMatch.location.x,
                    lat: bestMatch.location.y,
                    address: bestMatch.address
                };

                // Update the form fields
                document.getElementById('address').value = location.address || text;
                document.getElementById('lat').value = location.lat.toFixed(6);
                document.getElementById('lng').value = location.lng.toFixed(6);

                // Update the map
                updateMapMarker(location);
                view.goTo({
                    center: [location.lng, location.lat],
                    zoom: 15
                });
            } else {
                showNotification('error', 'Location not found');
            }
        })
        .catch(error => {
            showLoading(false);
            showNotification('error', 'Error searching for location');
            console.error('Search error:', error);
        });
}

// Geocode address and place marker
function geocodeAddress() {
    const address = document.getElementById('address').value.trim();
    if (!address) {
        showNotification('error', 'Please enter an address to search');
        return;
    }

    showLoading(true);
    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(address)}&outFields=Addr_type`)
        .then(response => response.json())
        .then(data => {
            showLoading(false);
            if (data.candidates && data.candidates.length > 0) {
                const bestMatch = data.candidates[0];
                const location = {
                    lng: bestMatch.location.x,
                    lat: bestMatch.location.y,
                    address: bestMatch.address
                };

                // Update the form fields
                document.getElementById('address').value = location.address || address;
                document.getElementById('lat').value = location.lat.toFixed(6);
                document.getElementById('lng').value = location.lng.toFixed(6);

                // Update the map
                updateMapMarker(location);
                view.goTo({
                    center: [location.lng, location.lat],
                    zoom: 15
                });
            } else {
                showNotification('error', 'Address not found');
            }
        })
        .catch(error => {
            showLoading(false);
            showNotification('error', 'Error searching for location');
            console.error('Search error:', error);
        });
}

// Reverse geocode to get address from coordinates
function reverseGeocode(point) {
    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${point.longitude},${point.latitude}`)
        .then(response => response.json())
        .then(data => {
            if (data.address) {
                document.getElementById('address').value = data.address.Match_addr || data.address.Address || '';
            }
        })
        .catch(error => {
            console.error("Reverse geocode error:", error);
        });
}

// Update map marker position
function updateMapMarker(location) {
    require(["esri/Graphic", "esri/geometry/Point"], function (Graphic, Point) {
        try {
            // Remove previous graphic
            if (markerGraphic) {
                map.remove(markerGraphic);
            }

            // Create point from location
            const point = new Point({
                longitude: location.lng,
                latitude: location.lat
            });

            // Create new graphic
            markerGraphic = new Graphic({
                geometry: point,
                symbol: {
                    type: "simple-marker",
                    color: [226, 119, 40],
                    outline: {
                        color: [255, 255, 255],
                        width: 2
                    }
                }
            });

            map.add(markerGraphic);
        } catch (error) {
            console.error("Error updating map marker:", error);
        }
    });
}

// Update form coordinates from map
function updateFormCoordinates(lat, lng) {
    document.getElementById('lat').value = lat.toFixed(6);
    document.getElementById('lng').value = lng.toFixed(6);
}

// Check location feasibility
function checkFeasibility() {
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);

    if (isNaN(lat)) {
        showNotification('error', 'Please select a location on the map or provide an address');
        return;
    }

    showLoading(true);

    // Get the distance threshold from settings
    const distanceThreshold = parseFloat(loadSettings());

    // Check against existing locations
    const result = analyzeLocation(lat, lng, existingLocations, distanceThreshold);

    // Display results
    displayResults(result, distanceThreshold);

    showLoading(false);
}

// Analyze location against existing locations
function analyzeLocation(lat, lng, existingLocations, distanceThreshold) {
    let nearestLocation = null;
    let minDistance = Infinity;
    let isFeasible = true;

    // Check distance to each existing location
    existingLocations.forEach(location => {
        const distance = calculateDistance(lat, lng, location.lat, location.lng);

        if (distance < minDistance) {
            minDistance = distance;
            nearestLocation = location;
        }

        if (distance < distanceThreshold) {
            isFeasible = false;
        }
    });

    return {
        isFeasible,
        distanceToNearest: minDistance,
        nearestLocation,
        distanceThreshold
    };
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3958.8; // Radius of the Earth in miles
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// Display feasibility results
function displayResults(result, distanceThreshold) {
    // Show the results section
    document.getElementById('results-section').classList.remove('hidden');

    // Update feasibility card
    const feasibilityCard = document.getElementById('feasibility-result-card');
    const feasibilityIcon = document.getElementById('feasibility-icon');
    const feasibilityStatus = document.getElementById('feasibility-status');
    const feasibilityDetails = document.getElementById('feasibility-details');

    if (result.isFeasible) {
        feasibilityCard.classList.remove('border-blue-500');
        feasibilityCard.classList.add('border-green-500');
        feasibilityIcon.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>';
        feasibilityStatus.textContent = 'Location is Feasible';
        feasibilityStatus.className = 'text-lg font-semibold text-green-600';
        feasibilityDetails.innerHTML = `
             <p>This location meets your minimum distance requirement of ${distanceThreshold} miles from existing franchises.</p>
             <p class="font-medium">Nearest franchise is ${result.distanceToNearest.toFixed(1)} miles away.</p>
         `;
    } else {
        feasibilityCard.classList.remove('border-blue-500');
        feasibilityCard.classList.add('border-red-500');
        feasibilityIcon.innerHTML = '<i class="fas fa-times-circle text-red-500"></i>';
        feasibilityStatus.textContent = 'Location is Not Feasible';
        feasibilityStatus.className = 'text-lg font-semibold text-red-600';
        feasibilityDetails.innerHTML = `
             <p>This location is too close to an existing franchise (${result.distanceToNearest.toFixed(1)} miles away).</p>
             <p class="font-medium">Your minimum required distance is ${distanceThreshold} miles.</p>
         `;
    }

    // Update nearest location card
    const nearestDetails = document.getElementById('nearest-location-details');
    if (result.nearestLocation) {
        nearestDetails.innerHTML = `
             <p><strong>Name:</strong> ${result.nearestLocation.name || 'Unknown'}</p>
             <p><strong>Address:</strong> ${result.nearestLocation.address || 'Unknown'}</p>
             <p><strong>Distance:</strong> ${result.distanceToNearest.toFixed(1)} miles</p>
             <p><strong>Status:</strong> ${result.nearestLocation.status || 'Unknown'}</p>
         `;
    } else {
        nearestDetails.innerHTML = '<p>No nearby franchises found in your network.</p>';
    }

    // Update detailed results
    const detailedResults = document.getElementById('detailed-results');
    detailedResults.innerHTML = `
         <div class="border-b pb-4 mb-4">
             <h4 class="font-medium text-gray-800 mb-2">Feasibility Summary</h4>
             <p>${result.isFeasible ?
            'This location meets all your feasibility requirements.' :
            'This location does not meet your minimum distance requirement.'}
             </p>
         </div>
         
         <div class="border-b pb-4 mb-4">
             <h4 class="font-medium text-gray-800 mb-2">Distance Analysis</h4>
             <p>Minimum required distance between franchises: <strong>${distanceThreshold} miles</strong></p>
             <p>Distance to nearest existing franchise: <strong>${result.distanceToNearest.toFixed(1)} miles</strong></p>
         </div>
         
         <div>
             <h4 class="font-medium text-gray-800 mb-2">Recommendation</h4>
             <p class="${result.isFeasible ? 'text-green-600' : 'text-red-600'} font-medium">
                 ${result.isFeasible ?
            '✓ This location is suitable for a new franchise.' :
            '✗ This location is not suitable due to proximity to existing franchises.'}
             </p>
         </div>
     `;
}

// Show loading state
function showLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

// Show notification
function showNotification(type, message) {
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

    document.getElementById('notification-container').appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}