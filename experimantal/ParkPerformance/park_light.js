
"use strict"; 
 
var loaded = false;

window.addEventListener('load', function ()
{
	console.log("onload: ", Date.now());
	loaded = true;
});

var isLoaded = function() {
	return loaded;
}

 window.domLoadedPromise = new Promise(function(resolve, reject)
{
	document.addEventListener('DOMContentLoaded', function ()
	{
		console.log("onDOMContentLoaded: ", Date.now());
		
		resolve();
	}, true);
});

try 
{
	chrome.runtime.getBackgroundPage(function(bgpage)
	{
		console.log("getBackgroundPage Loaded: ", Date.now());

		window.domLoadedPromise.then(function(){

			try
			{
				bgpage.park_inner(window, document, console, isLoaded);
			}
			catch (e)
			{
				console.error(e);
			}
		});
	});
}
catch (e)
{
	console.error(e);
}