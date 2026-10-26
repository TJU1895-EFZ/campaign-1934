mergeInto(LibraryManager.library, {
  Campaign1934Notify: function (eventNamePtr) {
    var eventName = UTF8ToString(eventNamePtr);
    if (window.parent) window.parent.postMessage({ type: 'campaign1934', event: eventName }, '*');
  }
});
