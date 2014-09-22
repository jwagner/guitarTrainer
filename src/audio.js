(function(){
var AudioContext = (window.AudioContext || window.webkitAudioContext);
app.value('audioCtx', new AudioContext());

app.factory('audioInputMediaStream', function($q){
    var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia).bind(navigator),
        deferred = $q.defer();
    if(getUserMedia){
        getUserMedia({audio: true}, deferred.resolve.bind(deferred), deferred.reject.bind(deferred)); 
    }
    else {
        deferred.reject('unavailable');
    }
    return deferred.promise;
});

app.factory('audioInputSource', function($q, audioCtx, audioInputMediaStream){
    return audioInputMediaStream.then(function(inputMediaStream){
        return audioCtx.createMediaStreamSource(inputMediaStream);
    });
});

app.factory('pitchDetector', function($q, $rootScope, audioCtx, audioInputSource){
    return function(){
        var pitch = {
                frequency: 440,
                confidence: 0
            },
            A4 = 440,
            window = 2048,
            maxFreq = 440,
            minFreq = 55,
            minLag = ~~(audioCtx.sampleRate/maxFreq),
            maxLag = ~~(audioCtx.sampleRate/minFreq);

        function process(e){
            $rootScope.$apply(function(){
                var signal = e.inputBuffer.getChannelData(0),
                    maxCorrelation = differenceCorrectedAutocorrelation(signal, minLag, 0, window, 1),
                    maxCorrelationLag = minLag;
                for(var lag = minLag+1; lag <= maxLag; lag++){
                    var correlation = differenceCorrectedAutocorrelation(signal, lag, 0, window, 1);
                    if(correlation < maxCorrelation) {
                        maxCorrelation = correlation;
                        maxCorrelationLag = lag;
                    }
                }
                var newFrequency = (audioCtx.sampleRate / maxCorrelationLag);
                if(Math.abs(newFrequency-pitch.frequency) > 10) {
                    pitch.frequency = newFrequency;
                }
                else {
                    pitch.frequency = pitch.frequency*0.5 + newFrequency*0.5;
                }
                pitch.note = (12+(12*Math.log(pitch.frequency/A4)/Math.log(2))%12)%12;
                pitch.correlation = maxCorrelation;
            });
        }

        function differenceCorrectedAutocorrelation(signal, lag, offset, window, step){
            //return autoCorrelation(signal, lag, offset, window, step);
            return autoCorrelation(signal, 0, offset, window, step) + autoCorrelation(signal, 0, offset+lag, window, step) - 2*autoCorrelation(signal, lag, offset, window, step);
        }

        function autoCorrelation(signal, lag, offset, window, step){
            var sum = 0;

            for(var i = offset, end = offset+window; i < end; i += step){
                var diff = (signal[i])*(signal[(i+lag)]);
                sum += diff;
            }
            return sum;
        }

        var deferred = $q.defer(),
            processor = audioCtx.createScriptProcessor(window*4, 1, 1),
            bandpass = audioCtx.createBiquadFilter();

        bandpass.type = 'bandpass';
        bandpass.frequency.value = (minFreq + maxFreq)/2
        bandpass.Q.value = (bandpass.frequency.value / (maxFreq - minFreq))*1.1;

        bandpass.connect(processor);
        processor.connect(audioCtx.destination);
        processor.onaudioprocess = process;

        return audioInputSource.then(function(input){
            input.connect(bandpass);
            return {
                pitch: pitch,
                disconnect: function(){
                    bandpass.disconnect();
                    processor.disconnect();
                }
            };
        });

    };
});

app.factory('audioInput', function($q, $injector, audioCtx, audioInputSource){
    return function(latency, process){
        var deferred = $q.defer(),
            processor = audioCtx.createScriptProcessor(latency||1024, 1, 1);
        processor.connect(audioCtx.destination);
        processor.onaudioprocess = process;
        return audioInputSource.then(function(input){
            input.connect(processor);
            return {
                node: processor,
                disconnect: function(){
                    input.disconnect(processor);
                    processor.disconnect(audioCtx.destination);
                }
            };
        });
    };
});

})();

