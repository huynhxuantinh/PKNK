(function () {
    'use strict';

    function widgetFor(fieldId) {
        return window[`geodjango_${fieldId.replace(/^id_/, '')}`];
    }

    function selectLocation(picker, result) {
        const widget = widgetFor(picker.dataset.fieldId);
        if (!widget || !window.ol) return;

        const coordinates = ol.proj.fromLonLat([
            Number(result.lon),
            Number(result.lat),
        ]);
        widget.clearFeatures();
        widget.featureCollection.push(new ol.Feature(new ol.geom.Point(coordinates)));
        widget.map.getView().animate({center: coordinates, zoom: 17, duration: 350});
        picker.querySelector('.branch-location-status').textContent = `Đã chọn: ${result.display_name}`;
        picker.querySelector('.branch-location-results').replaceChildren();
    }

    async function search(picker) {
        const input = picker.querySelector('input[type="search"]');
        const button = picker.querySelector('button');
        const status = picker.querySelector('.branch-location-status');
        const resultsBox = picker.querySelector('.branch-location-results');
        const query = input.value.trim();
        if (query.length < 3) {
            status.textContent = 'Nhập ít nhất 3 ký tự.';
            return;
        }

        button.disabled = true;
        status.textContent = 'Đang tìm vị trí...';
        resultsBox.replaceChildren();
        try {
            const params = new URLSearchParams({
                q: query,
                format: 'jsonv2',
                limit: '5',
                countrycodes: 'vn',
                addressdetails: '1',
            });
            const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
            if (!response.ok) throw new Error('search_failed');
            const results = await response.json();
            if (!results.length) {
                status.textContent = 'Không tìm thấy địa điểm phù hợp.';
                return;
            }
            status.textContent = `Tìm thấy ${results.length} kết quả:`;
            results.forEach((result) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'branch-location-result';
                item.textContent = result.display_name;
                item.addEventListener('click', () => selectLocation(picker, result));
                resultsBox.appendChild(item);
            });
        } catch (_error) {
            status.textContent = 'Không thể tìm vị trí lúc này. Bạn vẫn có thể chọn trực tiếp trên bản đồ.';
        } finally {
            button.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.branch-location-picker').forEach((picker) => {
            const input = picker.querySelector('input[type="search"]');
            picker.querySelector('.branch-location-search-row > button').addEventListener('click', () => search(picker));
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    search(picker);
                }
            });
        });
    });
})();
