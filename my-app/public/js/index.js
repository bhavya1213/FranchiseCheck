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
// Global variables to hold ArcGIS components
let map, view, markerGraphic, locator, graphicsLayer;

// Initialize the ArcGIS map with error handling
function initMap() {
    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/Graphic",
        "esri/layers/GraphicsLayer",
        "esri/geometry/Point"
    ],
        function (Map, MapView, Graphic, GraphicsLayer, Point) {

            try {
                // Create the map
                map = new Map({
                    basemap: "streets-navigation-vector"
                });

                // Create the view
                view = new MapView({
                    container: "mapViewDiv",
                    map: map,
                    center: [-98.5795, 39.8283],
                    zoom: 2,
                    ui: {
                        components: []
                    }
                });

                // Create a graphic for the marker
                graphicsLayer = new GraphicsLayer();
                map.add(graphicsLayer);

                // Wait for view to be ready
                view.when(function () {
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
                });

                // Initialize locator after map is ready
                initLocator();

            } catch (error) {
                showArcGisError("Failed to initialize map: " + error.message);
                console.error("Map initialization error:", error);
            }
        },
        function (error) {
            showArcGisError("Failed to load ArcGIS modules: " + error.message);
            console.error("ArcGIS module loading error:", error);
        }
    );
}

// Initialize the locator service with error handling
function initLocator() {
    require(["esri/tasks/Locator"],
        function (Locator) {
            try {
                locator = new Locator({
                    url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
                });
                console.log("Locator service initialized successfully");
            } catch (error) {
                showArcGisError("Failed to initialize locator service: " + error.message);
                console.error("Locator initialization error:", error);
            }
        },
        function (error) {
            showArcGisError("Failed to load Locator module: " + error.message);
            console.error("Locator module loading error:", error);
        }
    );
}

// Show ArcGIS specific errors
function showArcGisError(message) {
    const errorContainer = document.getElementById('arcgis-error-container');
    errorContainer.innerHTML = `
           <div class="arcgis-error">
               <strong>Map Error:</strong> ${message}
               <p>Some mapping features may not work properly.</p>
           </div>
       `;
    errorContainer.classList.remove('hidden');
}

// Update map marker position with error handling
function updateMapMarker(point) {
    require(["esri/Graphic"],
        function (Graphic) {
            try {

                const markerSymbol = {
                    type: "simple-marker",
                    color: "red",
                    size: "12px",
                    outline: {
                        color: "white",
                        width: 1
                    }
                };

                // Create new graphic
                markerGraphic = new Graphic({
                    geometry: point,
                    symbol: markerSymbol
                });

                // Remove previous graphic
                graphicsLayer.removeAll();
                graphicsLayer.add(markerGraphic);
                // Center view on the point
                view.goTo({
                    target: point,
                    zoom: 15
                }).catch(function (error) {
                    console.error("Error centering view:", error);
                });

            } catch (error) {
                console.error("Error updating map marker:", error);
            }
        },
        function (error) {
            console.error("Error loading Graphic module:", error);
        }
    );
}


// DOM Elements
const form = document.getElementById('location-form');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const clearBtn = document.getElementById('clear-btn');
const searchInput = document.getElementById('search-input');
const locationsTableBody = document.getElementById('locations-table-body');
const loadingRow = document.getElementById('loading-row');
const loadingOverlay = document.getElementById('loading-overlay');
const notificationContainer = document.getElementById('notification-container');
const mapContainer = document.getElementById('location-map');
const addressInput = document.getElementById('address');
const suggestionsList = document.getElementById('suggestions-list');

// State
let currentPage = 1;
const itemsPerPage = 11;
let totalLocations = 0;
let isEditing = false;
const existingLocations = [];
let suggestRequestHandler;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchLocations();

    // Form submission
    form.addEventListener('submit', handleFormSubmit);

    // Clear form
    clearBtn.addEventListener('click', resetForm);

    // Cancel edit
    cancelBtn.addEventListener('click', () => {
        resetForm();
        cancelBtn.classList.add('hidden');
        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Save Location';
    });

    // Search functionality
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        fetchLocations();
    });

    // Address input suggestions
    addressInput.addEventListener('input', handleAddressInput);
    addressInput.addEventListener('focus', handleAddressInput);

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!addressInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            suggestionsList.style.display = 'none';
        }
    });

    // Add search functionality
    const locationSearch = document.getElementById('location-search');

    // Handle Enter key in search
    if (locationSearch && searchBtn) {

        locationSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLocationSearch();
            }
        });

    } else {
        console.log("Search input or button not found. Make sure the elements exist in the DOM.");
    }

    searchInput.addEventListener('input', handleSearchInput);

    // Add search by Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            currentPage = 1;
            fetchLocations();
        }
    });

    // Add clear search button functionality
    const clearSearchBtn = document.createElement('button');
    clearSearchBtn.innerHTML = '<i class="fas fa-times"></i>';
    clearSearchBtn.className = 'absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors';
    clearSearchBtn.title = 'Clear search';
    clearSearchBtn.onclick = clearSearch;
    clearSearchBtn.style.display = 'none';

    // Add clear button to search input container
    const searchContainer = searchInput.parentNode;
    searchContainer.classList.add('relative');
    searchContainer.appendChild(clearSearchBtn);

    // Show/hide clear button based on input
    searchInput.addEventListener('input', () => {
        clearSearchBtn.style.display = searchInput.value.trim() ? 'block' : 'none';
    });
});

// Handle address input for suggestions
function handleAddressInput() {
    const address = addressInput.value.trim();
    if (address.length < 3) {
        suggestionsList.style.display = 'none';
        return;
    }

    // Use direct REST API call instead of ArcGIS modules to avoid dependency issues
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

function handleLocationSearch() {
    const searchTerm = document.getElementById('location-search').value.trim();
    if (!searchTerm) return;

    showLoading(true);

    // Use ArcGIS geocoding service
    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(searchTerm)}&outFields=Addr_type`)
        .then(response => response.json())
        .then(data => {
            showLoading(false);

            if (data.candidates && data.candidates.length > 0) {
                const bestMatch = data.candidates[0];
                const location = {
                    lat: bestMatch.location.y,
                    lng: bestMatch.location.x,
                    address: bestMatch.address
                };

                // Update the map
                updateMapMarker(location);

                // Update the form fields
                document.getElementById('address').value = location.address || searchTerm;
                document.getElementById('lat').value = location.lat.toFixed(6);
                document.getElementById('lng').value = location.lng.toFixed(6);

                // Zoom to the location
                require(["esri/geometry/Point"], function (Point) {
                    const point = new Point({
                        longitude: location.lng,
                        latitude: location.lat
                    });
                    view.goTo({
                        target: point,
                        zoom: 15
                    });
                    map.add(point);
                });

                showNotification('success', 'Location found and marked on map');
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


// Display address suggestions
function displaySuggestions(suggestions) {
    suggestionsList.innerHTML = '';

    if (suggestions.length === 0) {
        suggestionsList.style.display = 'none';
        return;
    }

    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = suggestion.text;
        item.addEventListener('click', async () => {
            addressInput.value = suggestion.text;
            suggestionsList.style.display = 'none';

            // Geocode the selected suggestion
            try {
                showLoading(true);
                const response = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(suggestion.text)}&magicKey=${encodeURIComponent(suggestion.magicKey)}&outFields=Addr_type`);
                const data = await response.json();
                showLoading(false);

                if (data.candidates && data.candidates.length > 0) {
                    const bestMatch = data.candidates[0];
                    const location = {
                        lng: bestMatch.location.x,
                        lat: bestMatch.location.y,
                        address: bestMatch.address
                    };

                    // Update the form fields
                    addressInput.value = location.address || suggestion.text;
                    document.getElementById('lat').value = location.lat.toFixed(6);
                    document.getElementById('lng').value = location.lng.toFixed(6);

                    // Update the map
                    require(["esri/geometry/Point"], function (Point) {
                        const point = new Point({
                            longitude: location.lng,
                            latitude: location.lat
                        });

                        // Update marker
                        updateMapMarker(point);

                        // Zoom to location
                        view.goTo({
                            target: point,
                            zoom: 15
                        });
                    });

                    showNotification('success', 'Location found and marked on map');
                } else {
                    showNotification('error', 'Location not found');
                }
            } catch (error) {
                showLoading(false);
                showNotification('error', 'Error searching for location');
                console.error('Search error:', error);
            }
        });
        suggestionsList.appendChild(item);
    });

    suggestionsList.style.display = 'block';
}

// Geocode a selected suggestion
function geocodeSuggestion(magicKey, text) {
    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(text)}&magicKey=${encodeURIComponent(magicKey)}&outFields=Addr_type`)
        .then(response => response.json())
        .then(data => {
            if (data.candidates && data.candidates.length > 0) {
                const result = data.candidates[0];
                const point = {
                    longitude: result.location.x,
                    latitude: result.location.y
                };

                updateMapMarker(point);
                updateFormCoordinates(point.latitude, point.longitude);

                // If we have the view object, center on the point
                if (view) {
                    require(["esri/geometry/Point"], function (Point) {
                        const esriPoint = new Point({
                            x: point.longitude,
                            y: point.latitude
                        });
                        view.goTo(esriPoint);
                    });
                }
            }
        })
        .catch(error => {
            console.error("Error geocoding suggestion:", error);
            showNotification('error', 'Failed to find location');
        });
}

// Reverse geocode to get address from coordinates
function reverseGeocode(point) {
    fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${point.longitude},${point.latitude}`)
        .then(response => response.json())
        .then(data => {
            if (data.address) {
                addressInput.value = data.address.Match_addr || data.address.Address || '';
            }
        })
        .catch(error => {
            console.error("Reverse geocode error:", error);
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
                const result = data.candidates[0];
                const point = {
                    longitude: result.location.x,
                    latitude: result.location.y
                };

                updateMapMarker(point);
                updateFormCoordinates(point.latitude, point.longitude);

                if (view) {
                    require(["esri/geometry/Point"], function (Point) {
                        const esriPoint = new Point({
                            x: point.longitude,
                            y: point.latitude
                        });

                    });
                }

                showNotification('success', 'Location found and marked on map');
            } else {
                showNotification('error', 'Address not found');
            }
        })
        .catch(error => {
            showLoading(false);
            showNotification('error', `Error: ${error.message}`);
            console.error('Geocoding error:', error);
        });
}
// Update map marker position
function updateMapMarker(point) {
    require(["esri/Graphic"], function (Graphic) {
        try {
            // Remove previous graphic
            if (markerGraphic) {
                map.remove(markerGraphic);
            }

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

// Geocode address and place marker
async function geocodeAddress() {
    const address = document.getElementById('address').value.trim();
    if (!address) {
        showNotification('error', 'Please enter an address to search');
        return;
    }

    showLoading(true);
    require(["esri/tasks/Locator"], function (Locator) {
        const locator = new Locator({
            url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
        });

        locator.addressToLocations({
            address: {
                SingleLine: address
            }
        }).then(function (results) {
            showLoading(false);
            if (results && results.length > 0) {
                const result = results[0];
                const point = new Point({
                    longitude: result.location.longitude,
                    latitude: result.location.latitude
                });

                updateMapMarker(point);
                updateFormCoordinates(point.latitude, point.longitude);
                view.goTo(point);

                showNotification('success', 'Location found and marked on map');
            } else {
                showNotification('error', 'Address not found');
            }
        }).catch(function (error) {
            showLoading(false);
            showNotification('error', `Error: ${error.message}`);
            console.error('Geocoding error:', error);
        });
    });
}


// Fetch locations from API
let allLocations = []; 
let filteredLocations = []; 


async function fetchLocations() {
    showLoading(true);
    try {
        const response = await fetch('/api/locations');
        if (!response.ok) throw new Error('Failed to fetch locations');

        allLocations = await response.json();

        // Apply search filter if there's a search term
        const searchTerm = searchInput.value.trim().toLowerCase();
        if (searchTerm) {
            filteredLocations = filterLocations(allLocations, searchTerm);
        } else {
            filteredLocations = [...allLocations];
        }

        totalLocations = filteredLocations.length;

        // Clear and repopulate existing locations array WITH STATUS
        existingLocations.length = 0;
        allLocations.forEach(loc => {
            if (loc.lat && loc.lng) {
                existingLocations.push({
                    id: loc.id,
                    lat: loc.lat,
                    lng: loc.lng,
                    status: loc.status
                });
            }
        });

        renderLocations(filteredLocations);
        updatePagination();
        updateSearchResults(searchTerm, filteredLocations.length, allLocations.length);
    } catch (error) {
        showNotification('error', `Error fetching locations: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Filter locations based on search term
function filterLocations(locations, searchTerm) {
    if (!searchTerm) return locations;

    return locations.filter(location => {
        const name = (location.name || '').toLowerCase();
        const address = (location.address || '').toLowerCase();
        const status = (location.status || '').toLowerCase();

        return name.includes(searchTerm) ||
            address.includes(searchTerm) ||
            status.includes(searchTerm);
    });
}

// Update search results display
function updateSearchResults(searchTerm, filteredCount, totalCount) {
    const searchResultsDiv = document.getElementById('search-results') || createSearchResultsDiv();

    if (searchTerm) {
        searchResultsDiv.innerHTML = `
            <div class="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
                <div class="flex items-center">
                    <i class="fas fa-search text-blue-400 mr-2"></i>
                    <div class="text-sm">
                        <span class="font-medium text-blue-800">Search Results:</span>
                        <span class="text-blue-700">
                            Found ${filteredCount} of ${totalCount} locations for "${searchTerm}"
                        </span>
                        ${filteredCount === 0 ?
                '<div class="mt-1 text-blue-600">Try different keywords or check spelling</div>' :
                ''
            }
                    </div>
                    <button onclick="clearSearch()" class="ml-auto text-blue-600 hover:text-blue-800">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        searchResultsDiv.classList.remove('hidden');
    } else {
        searchResultsDiv.classList.add('hidden');
    }
}

// Create search results div if it doesn't exist
function createSearchResultsDiv() {
    const searchResultsDiv = document.createElement('div');
    searchResultsDiv.id = 'search-results';
    searchResultsDiv.className = 'hidden';

    // Insert before the table
    const tableContainer = document.querySelector('.overflow-x-auto');
    tableContainer.parentNode.insertBefore(searchResultsDiv, tableContainer);

    return searchResultsDiv;
}

// Clear search function
function clearSearch() {
    searchInput.value = '';
    currentPage = 1;
    fetchLocations();
}

// Render locations in the table
function renderLocations(locations) {
    const searchTerm = searchInput.value.trim().toLowerCase();

    if (locations.length === 0) {
        const noResultsMessage = searchTerm ?
            `No locations found matching "${searchTerm}"` :
            'No locations found. Add your first location!';

        locationsTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                    <div class="flex flex-col items-center space-y-2">
                        <i class="fas ${searchTerm ? 'fa-search' : 'fa-map-marker-alt'} text-gray-400 text-2xl"></i>
                        <div>${noResultsMessage}</div>
                        ${searchTerm ?
                '<button onclick="clearSearch()" class="text-blue-600 hover:text-blue-800 text-sm">Clear search</button>' :
                ''
            }
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // Apply pagination
    const startIdx = (currentPage - 1) * itemsPerPage;
    const paginatedLocations = locations.slice(startIdx, startIdx + itemsPerPage);

    locationsTableBody.innerHTML = paginatedLocations.map(location => `
        <tr class="hover:bg-gray-50 cursor-pointer locations-row" data-id="${location.id}" onclick="showLocationDetails('${location.id}')">
            <td class="px-6 py-4 text-left">
                <div class="font-medium text-gray-900">${highlightSearchTerm(location.name, searchTerm)}</div>
            </td>
            <td class="px-6 py-4 text-left">
                <div class="text-gray-600 max-w-xs truncate">${highlightSearchTerm(location.address, searchTerm)}</div>
            </td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColorClass(location.status)}">
                    ${highlightSearchTerm(location.status, searchTerm)}
                </span>
            </td>
            <td class="px-6 py-4 text-center whitespace-nowrap">
                <div class="flex justify-center space-x-3">
                    <button onclick="event.stopPropagation(); editLocation('${location.id}')" 
                            class="text-blue-600 hover:text-blue-900 transition-colors"
                            title="Edit location">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteLocation('${location.id}')" 
                            class="text-red-600 hover:text-red-900 transition-colors"
                            title="Delete location">
                        <i class="fas fa-trash"></i>
                    </button>
                   
                </div>
            </td>
        </tr>
    `).join('');
}

// Highlight search terms in text
function highlightSearchTerm(text, searchTerm) {
    if (!searchTerm || !text) return text;

    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// View location on map function
function viewLocationOnMap(id) {
    const location = allLocations.find(loc => loc.id === id);
    if (location) {
        const lat = parseFloat(location.lat);
        const lng = parseFloat(location.lng);

        // Update map marker and center view
        require(["esri/geometry/Point"], function (Point) {
            const point = new Point({
                longitude: lng,
                latitude: lat
            });
            updateMapMarker(point);
            if (view) {
                view.goTo({
                    target: point,
                    zoom: 15
                });
            }
        });

        // Scroll to map
        document.getElementById('mapViewDiv').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        showNotification('success', `Showing ${location.name} on map`);
    }
}

let searchTimeout;
function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentPage = 1; // Reset to first page when searching
        fetchLocations();
    }, 300); // 300ms delay for better UX
}

function hasCoordinatesChanged(locationId, newLat, newLng) {
    const existingLocation = existingLocations.find(loc => loc.id === locationId);
    if (!existingLocation) return true;

    const latDiff = Math.abs(existingLocation.lat - newLat);
    const lngDiff = Math.abs(existingLocation.lng - newLng);

    // Consider coordinates changed if difference is more than 0.0001 degrees (~11 meters)
    return latDiff > 0.0001 || lngDiff > 0.0001;
}


// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    showLoading(true);

    const locationId = document.getElementById('location-id').value;
    const isUpdate = !!locationId;
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);
    const address = document.getElementById('address').value.trim();
    let status = document.getElementById('status').value;

    try {
        // Fetch the distance threshold from the server
        const response = await fetch('/api/miles');
        if (!response.ok) {
            throw new Error('Failed to fetch distance threshold');
        }
        const distanceData = await response.json();
        const selectedDistance = parseFloat(distanceData.mile) || 5;

        // Check for valid coordinates
        if (isNaN(lat) || isNaN(lng)) {
            if (address) {
                // Geocode the address if coordinates are missing
                const coords = await geocodeAddress(address);
                document.getElementById('lat').value = coords.lat.toFixed(6);
                document.getElementById('lng').value = coords.lng.toFixed(6);
                showLoading(false);
            } else {
                showNotification('error', 'Please select a location on the map or provide an address');
                return;
            }
        }

        // Validate new location distance - only for new locations or when updating coordinates
        if (!isUpdate || (isUpdate && hasCoordinatesChanged(locationId, lat, lng))) {
            // Filter out current location if updating
            const locationsToCheck = isUpdate
                ? existingLocations.filter(loc => loc.id !== locationId)
                : existingLocations;

            const isTooClose = validateNewLocation(
                { lat, lng },
                locationsToCheck,
                selectedDistance
            );

            if (isTooClose) {
                if (status !== 'Rejected') {
                    status = "Rejected";
                    showNotification('warning',
                        `Location is within ${selectedDistance} miles of an approved franchise and was automatically rejected`);
                }
            }
        }

        // Prepare form data
        const formData = {
            name: document.getElementById('name').value.trim(),
            address,
            lat,
            lng,
            status,
            distanceLimit: selectedDistance
        };

        // Determine endpoint and method
        const url = isUpdate ? `/api/locations/${locationId}` : '/api/locations';
        const method = isUpdate ? 'PUT' : 'POST';

        const saveResponse = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.error || 'Failed to save location');
        }

        const savedLocation = await saveResponse.json();
        const action = isUpdate ? 'updated' : (status === 'Rejected') ? 'added (auto-rejected due to proximity)' : 'added';

        const messageType = (status === 'Rejected' && !isUpdate) ? 'warning' : 'error';
        showNotification(messageType, `Location ${action} successfully!`);

        resetForm();
        fetchLocations();
    } catch (error) {
        showNotification('error', `Error: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}


// Validate new location against existing locations
function validateNewLocation(newLocation, existingLocations, radiusMiles = 5) {
    const radiusMeters = radiusMiles * 1609.34;
    const newLat = newLocation.lat;
    const newLng = newLocation.lng;

    // Only check against APPROVED locations
    const approvedLocations = existingLocations.filter(loc => loc.status === 'Approved');

    for (const loc of approvedLocations) {
        const distance = calculateDistance(newLat, newLng, loc.lat, loc.lng);
        if (distance <= radiusMeters) {
            return true; // Too close to an approved location
        }
    }
    return false;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371008.8; // More precise average Earth radius in meters
    const φ1 = lat1 * (Math.PI / 180);
    const φ2 = lat2 * (Math.PI / 180);
    const Δφ = (lat2 - lat1) * (Math.PI / 180);
    const Δλ = (lng2 - lng1) * (Math.PI / 180);

    const a = Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// Edit location
async function editLocation(id) {
    showLoading(true);
    try {
        const response = await fetch(`/api/locations/${id}`);
        if (!response.ok) throw new Error('Failed to fetch location');

        const location = await response.json();

        // Fill the form
        document.getElementById('location-id').value = location.id;
        document.getElementById('name').value = location.name;
        document.getElementById('address').value = location.address;
        document.getElementById('lat').value = location.lat;
        document.getElementById('lng').value = location.lng;
        document.getElementById('status').value = location.status;

        // Update map marker
        require(["esri/geometry/Point"], function (Point) {
            const point = new Point({
                longitude: location.lng,
                latitude: location.lat
            });
            updateMapMarker(point);
            if (view) {
                view.goTo({
                    traget: point,
                    zoom: 10,
                });
            } else {
                console.warn('Map view not ready yet');
            }
        });

        // Update UI for editing
        isEditing = true;
        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Update Location';
        cancelBtn.classList.remove('hidden');

        // Scroll to form
        document.querySelector('form').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showNotification('error', `Error fetching location: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

function checkLocationConflicts() {
    const approvedLocations = existingLocations.filter(loc => loc.status === 'Approved');
    const conflicts = [];

    // Fetch distance setting
    fetch('/api/miles')
        .then(response => response.json())
        .then(data => {
            const selectedDistance = parseFloat(data.mile) || 5;

            for (let i = 0; i < approvedLocations.length; i++) {
                for (let j = i + 1; j < approvedLocations.length; j++) {
                    const loc1 = approvedLocations[i];
                    const loc2 = approvedLocations[j];
                    const distance = calculateDistance(loc1.lat, loc1.lng, loc2.lat, loc2.lng);
                    const distanceInMiles = distance / 1609.34;

                    if (distanceInMiles <= selectedDistance) {
                        conflicts.push({
                            location1: loc1,
                            location2: loc2,
                            distance: distanceInMiles.toFixed(2)
                        });
                    }
                }
            }

            if (conflicts.length > 0) {
                console.warn('Found conflicts between approved locations:', conflicts);
                showNotification('warning',
                    `Warning: Found ${conflicts.length} conflicts between approved locations. Check console for details.`);
            } else {
                showNotification('success', 'No conflicts found between approved locations.');
            }
        });
}


// Delete location
async function deleteLocation(id) {
    if (!confirm('Are you sure you want to delete this location?')) return;

    showLoading(true);
    try {
        const response = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete location');

        showNotification('success', 'Location deleted successfully!');
        fetchLocations();
    } catch (error) {
        showNotification('error', `Error deleting location: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Reset form
function resetForm() {
    form.reset();
    document.getElementById('location-id').value = '';
    isEditing = false;
    require(["esri/Graphic"], function (Graphic) {
        map.remove(markerGraphic);
    });
    view.goTo({
        center: [0, 20],
        zoom: 2
    });
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(totalLocations / itemsPerPage);
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');

    const searchTerm = searchInput.value.trim();
    const resultType = searchTerm ? 'search results' : 'locations';

    paginationInfo.textContent = `Showing ${Math.min((currentPage - 1) * itemsPerPage + 1, totalLocations)}-${Math.min(currentPage * itemsPerPage, totalLocations)} of ${totalLocations} ${resultType}`;

    paginationControls.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.className = `px-3 py-1 rounded-md transition-colors ${currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLocations();
        }
    };
    paginationControls.appendChild(prevBtn);

    // Page numbers with ellipsis for large page counts
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = startPage + maxVisiblePages - 1;
    if (endPage > totalPages) {
        endPage = totalPages;
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Show first page and ellipsis if needed
    if (startPage > 1) {
        const firstPageBtn = createPageButton(1);
        paginationControls.appendChild(firstPageBtn);

        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'px-3 py-1 text-gray-500';
            paginationControls.appendChild(ellipsis);
        }
    }

    // Page number buttons
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = createPageButton(i);
        paginationControls.appendChild(pageBtn);
    }

    // Show last page and ellipsis if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'px-3 py-1 text-gray-500';
            paginationControls.appendChild(ellipsis);
        }

        const lastPageBtn = createPageButton(totalPages);
        paginationControls.appendChild(lastPageBtn);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.className = `px-3 py-1 rounded-md transition-colors ${currentPage === totalPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            fetchLocations();
        }
    };
    paginationControls.appendChild(nextBtn);
}

// Helper function to create page buttons
function createPageButton(pageNumber) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = pageNumber;
    pageBtn.className = `mx-1 px-3 py-1 rounded-md transition-colors ${pageNumber === currentPage ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`;
    pageBtn.onclick = () => {
        currentPage = pageNumber;
        fetchLocations();
    };
    return pageBtn;
}

// Add keyboard shortcuts for search
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }

    // Escape to clear search when search input is focused
    if (e.key === 'Escape' && document.activeElement === searchInput) {
        clearSearch();
        searchInput.blur();
    }
});

// Export functions for global access
window.clearSearch = clearSearch;
window.viewLocationOnMap = viewLocationOnMap;

// Show loading state
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
        loadingRow.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
        loadingRow.classList.add('hidden');
    }
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

    notificationContainer.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Helper function to get status color class
function getStatusColorClass(status) {
    switch (status) {
        case 'Process': return 'bg-yellow-100 text-yellow-800';
        case 'Approved': return 'bg-green-100 text-green-800';
        case 'Rejected': return 'bg-red-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

// The popup for the location view in details
// DOM Elements for popup
const locationPopup = document.getElementById('location-popup');
const popupTitle = document.getElementById('popup-title');
const popupContent = document.getElementById('popup-content');
const closePopupBtn = document.getElementById('close-popup');
const editFromPopupBtn = document.getElementById('edit-from-popup');
const viewOnMapBtn = document.getElementById('view-on-map');

// Current location in popup
let currentPopupLocation = null;

// Make functions available globally
window.editLocation = editLocation;
window.deleteLocation = deleteLocation;
window.showLocationDetails = showLocationDetails;

// Function to show location details in popup
async function showLocationDetails(id) {
    showLoading(true);
    try {
        const response = await fetch(`/api/locations/${id}`);
        if (!response.ok) throw new Error('Failed to fetch location');

        const location = await response.json();
        showLocationPopup(location);
    } catch (error) {
        showNotification('error', `Error fetching location: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Show location popup
function showLocationPopup(location) {
    currentPopupLocation = location;

    // Set popup content
    popupTitle.textContent = location.name || "Unknown Location";
    popupContent.innerHTML = `
          <p><strong>Address:</strong> ${location.address || "No address provided"}</p>
          <p><strong>Status:</strong> <span class="${getStatusColorClass(location.status)} px-2 py-1 rounded-full text-xs">${location.status || "Unknown"}</span></p>
          <p><strong>Coordinates:</strong> ${parseFloat(location.lat).toFixed(6)}, ${parseFloat(location.lng).toFixed(6)}</p>
          <p><strong>Added:</strong> ${location.created_at ? new Date(location.created_at).toLocaleDateString() : "Unknown"}</p>
      `;

    // Show popup
    locationPopup.classList.remove('hidden');
}

// Close location popup
function closeLocationPopup() {
    locationPopup.classList.add('hidden');
    currentPopupLocation = null;
}

// Set up popup event handlers
closePopupBtn.addEventListener('click', closeLocationPopup);

editFromPopupBtn.addEventListener('click', () => {
    if (currentPopupLocation) {
        editLocation(currentPopupLocation.id);
        closeLocationPopup();
    }
});

viewOnMapBtn.addEventListener('click', () => {
    if (currentPopupLocation) {
        const lat = parseFloat(currentPopupLocation.lat);
        const lng = parseFloat(currentPopupLocation.lng);
        window.location.href = `/map?lat=${lat}&lng=${lng}`;
    }
});

// Close popup when clicking outside
locationPopup.addEventListener('click', (e) => {
    if (e.target === locationPopup) {
        closeLocationPopup();
    }
});

/**************************************/ 

// Additional JavaScript for enhanced search functionality 

// Quick search function
function quickSearch(term) {
    document.getElementById('search-input').value = term;
    currentPage = 1;
    fetchLocations();
}

// Toggle search options menu
document.getElementById('search-options-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    const menu = document.getElementById('search-options-menu');
    menu.classList.toggle('hidden');
    menu.classList.toggle('show');
});

// Close search options menu when clicking outside
document.addEventListener('click', function(e) {
    const menu = document.getElementById('search-options-menu');
    const btn = document.getElementById('search-options-btn');
    
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add('hidden');
        menu.classList.remove('show');
    }
});

// Handle status filter changes
document.querySelectorAll('.status-filter').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        if (this.value === 'all') {
            // If "All" is checked, uncheck other filters
            if (this.checked) {
                document.querySelectorAll('.status-filter:not([value="all"])').forEach(cb => {
                    cb.checked = false;
                });
            }
        } else {
            // If any specific status is checked, uncheck "All"
            if (this.checked) {
                document.querySelector('.status-filter[value="all"]').checked = false;
            }
        }
        
        // Apply filters
        applyStatusFilters();
    });
});

// Apply status filters
function applyStatusFilters() {
    const checkedFilters = Array.from(document.querySelectorAll('.status-filter:checked'))
        .map(cb => cb.value)
        .filter(value => value !== 'all');
    
    // If no specific filters are checked, show all
    if (checkedFilters.length === 0) {
        document.querySelector('.status-filter[value="all"]').checked = true;
        currentPage = 1;
        fetchLocations();
        return;
    }
    
    // Filter locations by status
    const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
    let filtered = allLocations;
    
    // Apply text search first
    if (searchTerm) {
        filtered = filterLocations(filtered, searchTerm);
    }
    
    // Apply status filters
    if (checkedFilters.length > 0) {
        filtered = filtered.filter(location => 
            checkedFilters.includes(location.status)
        );
    }
    
    filteredLocations = filtered;
    totalLocations = filteredLocations.length;
    currentPage = 1;
    
    renderLocations(filteredLocations);
    updatePagination();
    updateSearchResults(searchTerm, filteredLocations.length, allLocations.length);
}

