def test_download_page_carries_our_preview_and_sends_to_app_store(client):
    res = client.get('/download')
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert 'og:image" content="https://aretefitnessapp.com/brand/og-image.png' in html
    assert "location.replace('https://apps.apple.com/app/id6771064342')" in html
