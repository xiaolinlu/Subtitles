/**
 * Subtitle Player Class abstracts video playback for
 * different formats, including embedded HTML 5, Youtube, Vimeo
 * etc.,
 *
 * Best with HTML 5 > YouTube > Vimeo... 
 * 
 */

/*jshint laxcomma:true */

(function(Subtitler, window){

  var Emitter = require('component-emitter');

  // Constructor
  var VideoElement = function(src, options){
    var options = options || {};

    this.src = src; 
    this.type = options.type || 'html';
    this.target = options.target ? '#' + options.target : '#player';
    this.isReady = false; 

    // YOUTUBE
    if (this.type === 'youtube') {
      this.isYoutube = true;
      this.target = options.target; 
      var self = this; 

      if (typeof(YT) === 'undefined') {
        window.onYouTubeIframeAPIReady = function() {
          self.buildYouTubeVideo();
        }
        $.getScript('//www.youtube.com/iframe_api');
      } else {
        this.buildYouTubeVideo();
      }
    };


    // REGULAR HTML
    if (this.type === 'html') {
      this.isHTML = true; 
      var el = this.videoNode = document.createElement('video');
      el.setAttribute('id', 'video-display');
      el.src = src;
      this.embedVideo(); 
    }

    // VIMEO
    if (this.type === 'vimeo') {
      this.isVimeo = true; 
      this.buildVimeoVideo();
    }
  };

  VideoElement.prototype = new Emitter(); 

  // Functions
  _.extend(VideoElement.prototype, {

    // Events
    
    // Loop the video if need be. 
    // Will this be triggered during 'seeking' with vimeo
    // and youtube?
    onTimeUpdate: function(data){

      if (Subtitler.draggingCursor)
        return;

      var end = Session.get('endTime')
        , duration = Session.get('loopDuration')
        , start = Session.get('startTime');

      var currentTime = data && data.seconds ? +data.seconds : this.getCurrentTime(); 

      Session.set('currentTime', currentTime);

      if (!end) {
        Session.set('endTime', currentTime + duration);
        Session.set('startTime', currentTime);
      } else if (Session.get('looping') 
          && Session.get('videoPlaying')
          && currentTime > end) {
        this.seekTo(start);
      }
      
    },

    onPlayback: function(){
      Session.set('videoPlaying', true);
      if (this.isYoutube)
        this.youtubeTimeUpdate();
    },

    onPauseOrError: function(){
      Session.set('videoPlaying', false);
      if (this.isYoutube && this.youtubeInterval)
        Meteor.clearInterval(this.youtubeInterval);
    },

    onReady: function(){
      this.isReady = true; 
      this.bindEvents(); 
      this.emit('ready');
      if (this.isHTML){
        this.emit('metaDataReceived');
      }
    },

    // A YouTube polyfill for timeUpdate.  
    youtubeTimeUpdate: function(stop){
      var update = _.bind(this.onTimeUpdate, this);
      this.youtubeInterval && Meteor.clearInterval(this.youtubeInterval);
      this.youtubeInterval = Meteor.setInterval(update, 250);
    },

    // Bind our events
    bindEvents: function(){
      var vid = this.videoNode
        , self = this;

      // Youtube Events
      if (this.isYoutube) {
        vid.addEventListener('onStateChange', function(state){
          if (state.data === 1) self.onPlayback();
          if (state.data === 0 || state.data === 2) self.onPauseOrError();
        });
        vid.addEventListener('onError', _.bind(this.onPauseOrError, this));

      // HTML5 Events
      } else if (this.isHTML) {
        vid.addEventListener('playing', _.bind(this.onPlayback, this));
        vid.addEventListener('pause', _.bind(this.onPauseOrError, this));
        vid.addEventListener('error', _.bind(this.onPauseOrError, this));
        vid.addEventListener('timeupdate', _.bind(this.onTimeUpdate, this));
 
      // Vimeo Events     
      } else if (this.isVimeo) {
        vid.addEvent('playProgress', _.bind(this.onTimeUpdate, this));
        vid.addEvent('seek', _.bind(this.onTimeUpdate, this));
        vid.addEvent('play', _.bind(this.onPlayback, this));
        vid.addEvent('pause', _.bind(this.onPauseOrError, this));
        vid.addEvent('finish', _.bind(this.onPauseOrError, this));
      }
    },

    // Bind onReady events with unified onReady function
    bindReady: function(){
      var vid = this.videoNode;

      if (this.isYoutube)
        vid.addEventListener('onReady', _.bind(this.onReady, this));
      
      else if (this.isHTML)
        vid.addEventListener('loadedmetadata', _.bind(this.onReady, this));
      
      else if (this.isVimeo)
        vid.addEvent('ready', _.bind(this.onReady, this));
    },

    // Playback Control / State
    getCurrentTime: function(){
      if (this.isYoutube) return this.videoNode.getCurrentTime();
      else if (this.isVimeo) {
        return this.videoNode.api('getCurrentTime');
      }
      else if (this.isHTML) return this.videoNode.currentTime; 
    },

    pauseVideo: function(){
      if (this.isYoutube) this.videoNode.pauseVideo();
      else if (this.isVimeo) this.videoNode.api('pause');
      else if (this.isHTML) this.videoNode.pause(); 
    },

    playVideo: function(){
      if (this.isYoutube) this.videoNode.playVideo();
      else if (this.isVimeo) this.videoNode.api('play');
      else if (this.isHTML) this.videoNode.play(); 
    },

    // Vimeo's function is async, so for consistency we'll
    // make each function return via callback. 
    getVideoDuration: function(callback){
      if (this.isYoutube) callback(this.videoNode.getDuration());
      else if (this.isVimeo) {
        this.videoNode.api('getDuration', function(time){
          callback(time);
        });
      }
      else if (this.isHTML) callback(this.videoNode.duration); 
    },

    seekTo: function(number){
      if (this.isYoutube) this.videoNode.seekTo(number);
      else if (this.isVimeo) this.videoNode.api('seekTo', number);
      else if (this.isHTML) this.videoNode.currentTime = number; 
    },

    // Vimeo doesn't support it. Firefox doesn't support
    // html5 playback rate. 
    setPlaybackRate: function(rate){
      if (this.isYoutube) this.videoNode.setPlaybackRate(rate);
      else if (this.isHTML) this.videoNode.playbackRate = rate; 
    },

    setTarget: function(target){
      this.target = target; 
      return this;
    },

    // Thanks to: http://stackoverflow.com/a/9102270/1198166
    getId: function(url){
      if (this.isYoutube) {
        var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/;
        var match = url.match(regExp);
        if (match && match[2].length==11){
          return match[2];
        }
      }
      if (this.isVimeo) {
        return _.last(url.split('/'));
      }
    },

    buildYouTubeVideo: function(){
      var self = this; 

      // Build the iframe
      this.videoNode = new YT.Player(this.target, {
        width: $('.video-dropzone').width(),
        height: '500',
        videoId: this.getId(this.src),
        playerVars: {
          controls: 0
        }
      });

      this.bindReady();

      window.youtubeFeedCallback = function(json){
        self.name = json.data.title;
        self.duration = json.data.duration;
        self.emit('metaDataReceived', json);
      };

      $.getScript('http://gdata.youtube.com/feeds/api/videos/'+ this.getId(this.src) + '?v=2&alt=jsonc&callback=youtubeFeedCallback&prettyprint=true');   
    },

    buildVimeoVideo: function(){
      var self = this; 
      var iframe = document.createElement('iframe');
      $(iframe).attr({
          src: 'http://player.vimeo.com/video/'+ this.getId(this.src) +'?api=1&player_id=vimeoPlayer',
          frameborder: 0,
          width: '100%',
          height: '350px',
          id: 'vimeoPlayer'
        });
      $(this.target).html(iframe);
      this.videoNode = $f(iframe);
      this.bindReady(); 

      window.vimeoFeedCallback = function(json){
        console.log(json, self);
        self.name = json[0].title;
        self.duration = json[0].duration; 
        self.emit('metaDataReceived', json);
      };

      var id = this.getId(this.src);
      $.getScript('http://vimeo.com/api/v2/video/'+ id +'.json?callback=vimeoFeedCallback');
    
    },

    // Embeds an HTML Video into a target DOM element.
    embedVideo: function(target) {
      target && this.setTarget(target);
      $(this.target).html(this.videoNode);
      this.bindReady(); 
      return this;
    },

    // Sync our video with our captions
    // XXX Do I even use this??
    syncCaptions: function(time, options) {
      var end = Session.get('endTime')
        , start = Session.get('startTime')
        , options = options || {};

      options.silence = options.silent || false; 

      if (time > end || time < start) {
        var result = Subtitles.findOne({startTime: {$lte : time}, endTime: {$gte: time}})
        if (result) {
          if (options.silent)
            Session.set('silentFocus', true);
          document.getElementById(result._id).focus(); 
          Session.set('currentSub', result)
        };
      }
    }

  });

  // Expose this class to the world.
  Subtitler.VideoElement = VideoElement; 

})(Subtitler, window);