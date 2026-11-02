<script>
  let { name, size = 16 } = $props()

  const paths = {
    plus: 'M12 5v14M5 12h14',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    back: 'M15 18l-6-6 6-6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    alert: 'M12 8v5M12 16.5h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    terminal: 'M4 17l6-5-6-5M12 19h8',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    stop: 'M7 7h10v10H7z',
    bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
    copy: 'M9 9h10v10H9zM5 15V5h10',
    sliders: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
    key: 'M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2 4.5 4.5 0 0 1 1.3 3.2zM13.2 12.7L20 19.5M17 16.5l2-2M15 14.5l1.5-1.5',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
    server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
    eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    pulse: 'M3 12h4l2.5-6 5 12 2.5-6h4'
  }
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]} />
</svg>
