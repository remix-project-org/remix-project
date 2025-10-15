/**
 * Matomo Debug Plugin
 * 
 * Debugging plugin for Matomo tracking data capture and analysis.
 */


// Main plugin initialization function
function initMatomoDebugPlugin() {
  console.log('[MatomoDebugPlugin] === INITIALIZATION STARTING ===');
  


  // Initialize data storage
  if (!window.__matomoDebugData) {
    window.__matomoDebugData = {
      requests: [],
      events: [],
      pageViews: [],
      dimensions: {},
      visitorIds: []
    };
  }



  // Helper functions - always available globally
  window.__getMatomoDebugData = function() {
    return window.__matomoDebugData || {
      requests: [],
      events: [],
      pageViews: [],
      dimensions: {},
      visitorIds: []
    };
  };

  window.__getLatestVisitorId = function() {
    const data = window.__matomoDebugData;
    if (!data || !data.visitorIds.length) return null;
    
    const latest = data.visitorIds[data.visitorIds.length - 1];
    return {
      visitorId: latest.visitorId,
      isNull: latest.isNull,
      timestamp: latest.timestamp
    };
  };

  window.__getMatomoDimensions = function() {
    const data = window.__matomoDebugData;
    return data ? data.dimensions : {};
  };

  window.__clearMatomoDebugData = function() {
    window.__matomoDebugData = {
      requests: [],
      events: [],
      pageViews: [],
      dimensions: {},
      visitorIds: []
    };
  };

  // Helper functions to get parsed data
  window.__getMatomoEvents = function() {
    const data = window.__matomoDebugData;
    return data ? data.events : [];
  };

  window.__getMatomoPageViews = function() {
    const data = window.__matomoDebugData;
    return data ? data.pageViews : [];
  };

  window.__getLatestMatomoEvent = function() {
    const events = window.__getMatomoEvents();
    return events.length > 0 ? events[events.length - 1] : null;
  };

  window.__getMatomoEventsByCategory = function(category) {
    const events = window.__getMatomoEvents();
    return events.filter(event => event.category === category);
  };

  window.__getMatomoEventsByAction = function(action) {
    const events = window.__getMatomoEvents();
    return events.filter(event => event.action === action);
  };

  // Helper function to parse visitor ID from request
  function parseVisitorId(request) {
    if (!request) return null;
    
    console.log('[DEBUG] parseVisitorId - Full request:', request);
    
    // Look for _id parameter - this IS the visitor ID (not a separate userId)
    // In anonymous mode: _id= (empty)
    // In cookie mode: _id=18d92915c3022ce2 (has value)
    const match = request.match(/_id=([^&]*)/);
    console.log('[DEBUG] parseVisitorId - _id match:', match);
    
    if (match) {
      const visitorIdValue = match[1];
      console.log('[DEBUG] parseVisitorId - Raw _id value:', `"${visitorIdValue}"`);
      
      // If _id is empty or null, this is anonymous mode
      if (!visitorIdValue || visitorIdValue === '' || visitorIdValue === 'null' || visitorIdValue === 'undefined') {
        console.log('[DEBUG] parseVisitorId - Anonymous mode (_id is empty), returning null');
        return null;
      }
      
      // If _id has a value, this is cookie mode
      const visitorId = decodeURIComponent(visitorIdValue);
      console.log('[DEBUG] parseVisitorId - Cookie mode (_id has value), returning:', visitorId);
      return visitorId;
    }
    
    // _id parameter not found at all
    console.log('[DEBUG] parseVisitorId - No _id parameter found, returning null');
    return null;
  }

  // Helper function to parse event data from request string
  function parseEventData(request) {
    if (!request) return null;
    
    try {
      const params = new URLSearchParams(request);
      
      // Check if this is an event (has e_c parameter)
      const eventCategory = params.get('e_c');
      if (!eventCategory) return null;
      
      const eventData = {
        category: decodeURIComponent(eventCategory || ''),
        action: decodeURIComponent(params.get('e_a') || ''),
        name: decodeURIComponent(params.get('e_n') || ''),
        value: params.get('e_v') ? parseFloat(params.get('e_v')) : null,
        visitorId: parseVisitorId(request), // From _id parameter: has value in cookie mode, null in anonymous mode
        dimension1: params.get('dimension1') ? decodeURIComponent(params.get('dimension1')) : null, // tracking mode
        dimension2: params.get('dimension2') ? decodeURIComponent(params.get('dimension2')) : null,
        dimension3: params.get('dimension3') ? decodeURIComponent(params.get('dimension3')) : null,
        url: params.get('url') ? decodeURIComponent(params.get('url')) : null,
        referrer: params.get('urlref') ? decodeURIComponent(params.get('urlref')) : null,
        timestamp: Date.now()
      };

      return eventData;
      
    } catch (e) {
      console.error('[MatomoDebugPlugin] Failed to parse event data:', e);
      return null;
    }
  }

  // Helper function to parse page view data from request string
  function parsePageViewData(request) {
    if (!request) return null;
    
    try {
      const params = new URLSearchParams(request);
      
      // Check if this is a page view (has url parameter but no e_c)
      if (params.get('e_c') || !params.get('url')) return null;
      
      return {
        url: decodeURIComponent(params.get('url') || ''),
        title: params.get('action_name') ? decodeURIComponent(params.get('action_name')) : null,
        visitorId: parseVisitorId(request), // From _id parameter: has value in cookie mode, null in anonymous mode
        dimension1: params.get('dimension1') ? decodeURIComponent(params.get('dimension1')) : null,
        dimension2: params.get('dimension2') ? decodeURIComponent(params.get('dimension2')) : null,
        dimension3: params.get('dimension3') ? decodeURIComponent(params.get('dimension3')) : null,
        referrer: params.get('urlref') ? decodeURIComponent(params.get('urlref')) : null,
        timestamp: Date.now()
      };
    } catch (e) {
      console.warn('[Matomo Debug] Failed to parse page view data:', e);
      return null;
    }
  }

  // Plugin registration function
  function registerPlugin() {
    if (!window.Matomo || typeof window.Matomo.addPlugin !== 'function') {
      console.error('[MatomoDebugPlugin] Matomo not found or addPlugin not available');
      return false;
    }

    try {
      console.log('[MatomoDebugPlugin] Registering plugin with Matomo');
      window.Matomo.addPlugin('DebugPlugin', {
        log: function () {
          const data = window.__matomoDebugData;
          data.pageViews.push({
            title: document.title,
            url: window.location.href,
            timestamp: Date.now()
          });

          return '';
        },
        
        // This event function is called by Matomo when events are tracked
        event: function () {
          const args = Array.from(arguments);
          console.log('[MatomoDebugPlugin] Captured event with args:', args);
          
          const data = window.__matomoDebugData;
          
          // Extract request string from first argument
          let requestString = null;
          if (args[0] && typeof args[0] === 'object' && args[0].request) {
            requestString = args[0].request;
            // Store the raw request for debugging
            data.requests.push({
              request: requestString,
              timestamp: Date.now(),
              method: 'plugin_event',
              url: requestString
            });
            
            // Parse event data from the request string  
            const eventData = parseEventData(requestString);
            if (eventData) {
              data.events.push(eventData);
            }
            
            // Parse page view data
            const pageViewData = parsePageViewData(requestString);
            if (pageViewData) {
              data.pageViews.push(pageViewData);
            }
            
            // Parse visitor ID
            const visitorId = parseVisitorId(requestString);
            if (visitorId || (requestString && requestString.includes('_id='))) {
              const match = requestString ? requestString.match(/[?&]_id=([^&]*)/) : null;
              const actualVisitorId = match ? decodeURIComponent(match[1]) : null;
              
              data.visitorIds.push({
                visitorId: actualVisitorId,
                isNull: !actualVisitorId || actualVisitorId === 'null' || actualVisitorId === '',
                timestamp: Date.now()
              });
            }
            
            // Parse dimensions
            const dimensionMatches = requestString ? requestString.match(/[?&]dimension(\d+)=([^&]*)/g) : [];
            if (dimensionMatches) {
              dimensionMatches.forEach(match => {
                const [, dimNum, dimValue] = match.match(/dimension(\d+)=([^&]*)/);
                data.dimensions['dimension' + dimNum] = decodeURIComponent(dimValue);
              });
            }
            
          } else {
            // Store raw event data as fallback
            data.events.push({
              timestamp: Date.now(),
              method: 'plugin_event',
              args: args,
              category: 'unknown',
              action: 'unknown',
              raw_data: args
            });
          }
          
          return '';
        }
      });

      return true;
    } catch (e) {
      console.error('[MatomoDebugPlugin] Failed to register plugin:', e);
      return false;
    }
  }

  // Try to register immediately if Matomo is already loaded
  if (window.Matomo && typeof window.Matomo.addPlugin === 'function') {
    console.log('[MatomoDebugPlugin] Matomo already loaded, registering immediately');
    registerPlugin();
  } else {
    // Register for Matomo's async plugin initialization as fallback
    console.log('[MatomoDebugPlugin] Matomo not ready, queuing for async initialization');
    if (typeof window.matomoPluginAsyncInit === 'undefined') {
      window.matomoPluginAsyncInit = [];
    }
    window.matomoPluginAsyncInit.push(registerPlugin);
  }
}

// Export for use in loader
if (typeof window !== 'undefined') {
  window.initMatomoDebugPlugin = initMatomoDebugPlugin;
}