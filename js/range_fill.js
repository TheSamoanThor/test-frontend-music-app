(function() {
        'use strict';

        window.updateRangeFill = function(range) {
          if (!range) return;
          const min = range.min ? parseFloat(range.min) : 0;
          const max = range.max ? parseFloat(range.max) : 100;
          const val = parseFloat(range.value);
          const percent = ((val - min) / (max - min)) * 100;

          const computedStyle = getComputedStyle(document.documentElement);
          const primaryColor = computedStyle.getPropertyValue('--primary-color').trim() || '#4a90e2';
          const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#dee2e6';

          range.style.background = `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${percent}%, ${borderColor} ${percent}%, ${borderColor} 100%)`;
        };

        function attachHandler(range) {
          if (!range._rangeFillHandler) {
            const handler = function() { window.updateRangeFill(this); };
            range.addEventListener('input', handler);
            range.addEventListener('change', handler);
            range._rangeFillHandler = handler;
          }
          window.updateRangeFill(range);
        }

        function initAllRanges() {
          document.querySelectorAll('input[type=range]').forEach(attachHandler);
        }

        window.initAllRanges = initAllRanges;

        const observer = new MutationObserver(mutations => {
          mutations.forEach(mut => {
            mut.addedNodes.forEach(node => {
              if (node.nodeType === 1) {
                if (node.matches && node.matches('input[type=range]')) {
                  attachHandler(node);
                }
                if (node.querySelectorAll) {
                  node.querySelectorAll('input[type=range]').forEach(attachHandler);
                }
              }
            });
          });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initAllRanges);
        } else {
          initAllRanges();
        }

        const themeControls = document.querySelectorAll('#theme-select, #theme-select-settings, #custom-color-settings');
        themeControls.forEach(el => {
          el.addEventListener('change', () => setTimeout(initAllRanges, 50));
          el.addEventListener('input', () => setTimeout(initAllRanges, 50));
        });
      })();