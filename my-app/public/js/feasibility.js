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
                    zoom: 2,
                    ui: {
                        components: []
                    }
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

// Load settings from API
async function loadSettings() {
    try {
        const response = await fetch('/api/miles');
        if (!response.ok) throw new Error('Failed to load settings');

        const data = await response.json();
        const savedDistance = data.mile || 5;

        document.getElementById('current-distance').textContent = `${savedDistance} miles`;
        document.getElementById('settings-distance-input').value = savedDistance;

        return savedDistance;
    } catch (error) {
        console.error('Error loading settings:', error);
        return 5; // Default value
    }
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

    // Setting save button

    document.getElementById('save-distance-settings').addEventListener('click', async () => {
        const inputElement = document.getElementById('settings-distance-input');
        const mileValue = parseInt(inputElement.value);

        if (isNaN(mileValue) || mileValue < 5 || mileValue > 100) {
            alert('please enter value between 5 and 100');
            return;
        }
        try {
            const response = await fetch('/api/miles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mile: mileValue })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save setting');
            }

            const data = await response.json();
            alert('Settings saved successfully!');
            console.log('Saved Data', data);
        } catch (error) {
            console.error('Error:', error);
            alert(error.message);
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

function analyzeLocation(lat, lng, existingLocations, distanceThreshold) {
    // Filter out the exact location being checked
    const filteredLocations = existingLocations.filter(location => {
        const isSameLocation = Math.abs(lat - location.lat) < 0.0001 && Math.abs(lng - location.lng) < 0.0001;
        return !isSameLocation;
    });

    let nearestLocation = null;
    let nearestApprovedLocation = null;
    let minDistance = Infinity;
    let minApprovedDistance = Infinity;
    let isFeasible = true;

    filteredLocations.forEach(location => {
        const distance = calculateDistance(lat, lng, location.lat, location.lng);

        // Always track the nearest location regardless of status
        if (distance < minDistance) {
            minDistance = distance;
            nearestLocation = location;
        }

        // Only track approved locations for the approved distance check
        if (location.status.toLowerCase() === 'approved' && distance < minApprovedDistance) {
            minApprovedDistance = distance;
            nearestApprovedLocation = location;
        }
    });

    // Feasibility is determined by distance to approved locations only
    isFeasible = minApprovedDistance >= distanceThreshold;

    return {
        isFeasible,
        distanceToNearest: minDistance,
        nearestLocation,
        distanceToNearestApproved: minApprovedDistance,
        nearestApprovedLocation,
        distanceThreshold,
        checkedLocationsCount: filteredLocations.length
    };
}


async function checkFeasibility() {
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);

    if (isNaN(lat)) {
        showNotification('error', 'Please select a location on the map or provide an address');
        return;
    }

    showLoading(true);

    try {
        // Get the current distance threshold
        const response = await fetch('/api/miles');
        if (!response.ok) throw new Error('Failed to load distance setting');
        const settings = await response.json();
        const distanceThreshold = settings.mile || 5;

        let result = analyzeLocation(lat, lng, existingLocations, distanceThreshold);

        if (result.checkedLocationsCount === 0) {
            result = analyzeLocation(lat, lng, existingLocations, distanceThreshold);
            result.globalSearch = true;
        }

        // Display results
        displayResults(result, distanceThreshold);
    } catch (error) {
        console.error('Feasibility check error:', error);
        showNotification('error', 'Error checking feasibility');
    } finally {
        showLoading(false);
    }
}

function displayResults(result, distanceThreshold) {
    // Show the results section
    document.getElementById('results-section').classList.remove('hidden');

    // Get elements
    const feasibilityCard = document.getElementById('feasibility-result-card');
    const feasibilityIcon = document.getElementById('feasibility-icon');
    const feasibilityStatus = document.getElementById('feasibility-status');
    const feasibilityDetails = document.getElementById('feasibility-details');
    const nearestDetails = document.getElementById('nearest-location-details');

    // Helper function to extract city/state from address
    function getCityState(address) {
        if (!address) return 'Unknown Location';

        // Split address by commas and get relevant parts
        const parts = address.split(',').map(part => part.trim());

        if (parts.length >= 2) {
            // For international addresses, show last 2-3 parts (city, state/region, country)
            if (parts.length >= 3) {
                return `${parts[parts.length - 3]}, ${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
            } else {
                return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
            }
        }

        return address; // Fallback to full address if parsing fails
    }

    // Determine feasibility
    if (result.isFeasible) {
        // Location is feasible
        feasibilityCard.className = 'border-l-4 border-green-500 bg-green-50 p-4 mb-4';
        feasibilityIcon.innerHTML = '<i class="fas fa-check-circle text-green-500 text-2xl"></i>';
        feasibilityStatus.textContent = 'Location is Feasible';
        feasibilityStatus.className = 'text-lg font-semibold text-green-600';

        feasibilityDetails.innerHTML = `
            <p class="text-gray-700">This location meets your minimum distance requirement of <strong>${distanceThreshold} miles</strong> from approved franchises.</p>
        `;

        // Show nearest approved location even when feasible
        if (result.nearestApprovedLocation) {
            const cityState = getCityState(result.nearestApprovedLocation.address);
            nearestDetails.innerHTML = `
                <div class="bg-blue-50 border-l-4 border-blue-500 p-4">
                    <h4 class="text-blue-600 font-semibold mb-2">
                        <i class="fas fa-map-marker-alt text-blue-500"></i> Nearest Approved Franchise
                    </h4>
                    <p><strong>Name:</strong> ${result.nearestApprovedLocation.name || 'Unknown'}</p>
                    <p><strong>Location:</strong> ${cityState}</p>
                    <p><strong>Distance:</strong> ${result.distanceToNearestApproved.toFixed(1)} miles</p>
                    <p><strong>Status:</strong> <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Approved</span></p>
                </div>
            `;
        } else {
            nearestDetails.innerHTML = `
                <div class="bg-blue-50 border-l-4 border-blue-500 p-4">
                    <h4 class="text-blue-600 font-semibold mb-2">
                        <i class="fas fa-map-marker-alt text-blue-500"></i> Nearest Approved Franchise
                    </h4>
                    <p>No approved franchises found in the system.</p>
                </div>
            `;
        }
    } else {
        // Location is not feasible
        feasibilityCard.className = 'border-l-4 border-red-500 bg-red-50 p-4 mb-4';
        feasibilityIcon.innerHTML = '<i class="fas fa-times-circle text-red-500 text-2xl"></i>';
        feasibilityStatus.textContent = 'Location is Not Feasible';
        feasibilityStatus.className = 'text-lg font-semibold text-red-600';

        // Approved franchise details
        let detailsHtml = `
            <p class="text-gray-700">This location is too close to an approved franchise (<strong>${result.distanceToNearestApproved.toFixed(1)} miles</strong> away).</p>
            <p class="text-gray-700 font-medium mt-2">Minimum required distance is <strong>${distanceThreshold} miles</strong> from approved franchises.</p>
        `;

        if (result.nearestApprovedLocation) {
            const cityState = getCityState(result.nearestApprovedLocation.address);
            detailsHtml += `
                <div class="mt-4 border-t pt-4">
                    <h4 class="font-medium text-gray-800 mb-2">Conflicting Approved Franchise</h4>
                    <p><strong>Name:</strong> ${result.nearestApprovedLocation.name || 'Unknown'}</p>
                    <p><strong>Location:</strong> ${cityState}</p>
                    <p><strong>Distance:</strong> ${result.distanceToNearestApproved.toFixed(1)} miles</p>
                    <p><strong>Status:</strong> <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Approved</span></p>
                </div>
            `;
        }

        feasibilityDetails.innerHTML = detailsHtml;

        // Show other nearest franchise if different from the conflicting one
        if (result.nearestLocation && (!result.nearestApprovedLocation || result.nearestLocation.id !== result.nearestApprovedLocation.id)) {
            const cityState = getCityState(result.nearestLocation.address);
            nearestDetails.innerHTML = `
                <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                    <h4 class="text-yellow-600 font-semibold mb-2">
                        <i class="fas fa-map-marker-alt text-yellow-500"></i> Other Nearby Franchise
                    </h4>
                    <p><strong>Name:</strong> ${result.nearestLocation.name || 'Unknown'}</p>
                    <p><strong>Location:</strong> ${cityState}</p>
                    <p><strong>Distance:</strong> ${result.distanceToNearest.toFixed(1)} miles</p>
                    <p><strong>Status:</strong> <span class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">${result.nearestLocation.status || 'Unknown'}</span></p>
                </div>
            `;
        } else {
            nearestDetails.innerHTML = ''; // Don't show duplicate information
        }
    }
}


// Helper function to get color class based on status
function getStatusColorClass(status) {
    if (!status) return 'text-gray-600';
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('approved')) return 'text-green-600';
    if (lowerStatus.includes('process')) return 'text-yellow-600';
    if (lowerStatus.includes('pending')) return 'text-blue-600';
    if (lowerStatus.includes('rejected') || lowerStatus.includes('denied')) return 'text-red-600';
    return 'text-gray-600';
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


document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/miles');
        if (!response.ok) throw new Error('Failed to load setting');

        const data = await response.json();
        document.getElementById('settings-distance-input').value = data.mile || 5;
    } catch (error) {
        console.error('Error loading setting', error);
    }
});