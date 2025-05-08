document.getElementById('check-feasibility').addEventListener('click', () => {
    const input = document.getElementById('location-search').value.trim();
    const resultBox = document.getElementById('feasibility-result');
    const statusText = document.getElementById('feasibility-status');

    if (!input) return;

    let lat, lng;
    const coordMatch = input.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[3]);
    } else {
        alert("Please enter coordinates in 'lat,lng' format.");
        return;
    }

    const isTooClose = existingLocations.some(loc => {
        const distance = getDistanceInMiles(lat, lng, loc.lat, loc.lng);
        return distance <= 5;
    });

    resultBox.classList.remove("hidden");
    resultBox.classList.remove("border-l-green-500", "border-l-red-500");

    if (isTooClose) {
        statusText.textContent = "Not Feasible — location is within 5 miles of another.";
        resultBox.classList.add("border-l-red-500");
    } else {
        statusText.textContent = "Feasible — location is available!";
        resultBox.classList.add("border-l-green-500");
    }
});


