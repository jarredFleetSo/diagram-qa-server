(() => {
  // Remove any existing overlay from a previous injection
  const existing = document.getElementById('__diagramQAOverlay');
  if (existing) existing.remove();

  let overlay, selectionBox;
  let startX, startY, isSelecting = false;

  function cleanup() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  }

  function onMouseDown(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.display = 'block';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0';
    selectionBox.style.height = '0';
  }

  function onMouseMove(e) {
    if (!isSelecting) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(selectionBox.style, {
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px'
    });
  }

  function onMouseUp(e) {
    if (!isSelecting) return;
    isSelecting = false;

    const rect = {
      x: Math.min(e.clientX, startX),
      y: Math.min(e.clientY, startY),
      width: Math.abs(e.clientX - startX),
      height: Math.abs(e.clientY - startY)
    };

    cleanup();

    if (rect.width < 10 || rect.height < 10) {
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
      return;
    }

    chrome.runtime.sendMessage({
      action: 'captureRegion',
      rect: rect,
      devicePixelRatio: window.devicePixelRatio || 1
    });
  }

  // Create and show the overlay immediately on injection
  overlay = document.createElement('div');
  overlay.id = '__diagramQAOverlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(0, 0, 0, 0.15)'
  });

  selectionBox = document.createElement('div');
  Object.assign(selectionBox.style, {
    position: 'fixed',
    border: '2px solid #4361ee',
    background: 'rgba(67, 97, 238, 0.1)',
    display: 'none',
    zIndex: '2147483647',
    pointerEvents: 'none'
  });

  overlay.appendChild(selectionBox);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
})();
