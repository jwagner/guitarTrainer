(function(){
    

var t = 0;
function integrate(e, frequency, strobe, audioCtx){
    var input = e.inputBuffer.getChannelData(0),
        t = e.playbackTime,
        skip=16,
        period = 1/frequency,
        td = 1/e.inputBuffer.sampleRate;

    // fade
    for(var i = 0, i_len = strobe.length; i < i_len; i++) {
        strobe[i] *= 0.0;
    }

    // integrate square waves and input
    for(i = 0, i_len = input.length; i < i_len; i+=skip, t+=td*skip) {
        if((input[i]) > 0.0) {

            // normalized phase 0..1
            var phase = t/period;

            for(var j = 0, j_len = strobe.length; j < j_len; j++) {
                if((t/period+j/j_len)%1 < 0.5){
                    strobe[j] += 1;//input[i]*input[i];
                }
            }
        }
    }
    //gt=t;
}

app.directive('strobePanel', function(audioInput, audioCtx){
    return {
        scope: {
            frequency: '=',
            periods: '='
        },
        link: function($scope, element, attrs) {
            var canvas = element[0],
                ctx = canvas.getContext('2d'),
                period = Math.floor(canvas.width/$scope.periods),
                strobe = new Float32Array(period),
                patternCanvas = document.createElement('canvas'),
                patternCtx = patternCanvas.getContext('2d');

            patternCanvas.width = period;
            patternCanvas.height = 1;
            patternCtx.fillRect(0, 0, period, 1);

            var patternData = patternCtx.getImageData(0, 0, period, 1);

            function process(e){
                integrate(e, $scope.frequency, strobe, audioCtx);
                draw(strobe);
            }

            function draw(strobe){
                var d = patternData.data,
                    r = 10,
                    g = 128,
                    b = 255;
                var scale = 1/_.max(strobe);
                for(var i = 0, i_len = strobe.length; i < i_len; i++) {
                    var s = strobe[i],
                        p = i*4;
                    d[p] = s*r*scale;
                    d[p+1] = s*g*scale;
                    d[p+2] = s*b*scale;
                }
                patternCtx.putImageData(patternData, 0, 0);
                ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            var input = audioInput(4096, process);
            $scope.$on('$destroy', function(){
                input.then(function(processor) { processor.disconnect(); });
            });
        }
    };
});

app.directive('strobeTuner', function($interval, audioInput, pitchDetector){
    return {
        scope: {},
        link: function($scope, element, attrs) {
            var detector,
                detectorPromise = pitchDetector();
            detectorPromise.then(function(d){
                detector = d;
                $scope.pitch = detector.pitch;
            });
            function noteFrequency(n){
                return Math.pow(2, n/12)*110;
            }
            $scope.$watch('pitch.note', function(note){
                if(note === undefined) return;
                var roundedNote = Math.round(note);
                $scope.cents = (note-roundedNote)*100;
                $scope.noteName = notes[roundedNote%12];
                $scope.frequency = Math.pow(2, (roundedNote%12)/12)*110;
            });
            var notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
            $scope.frequency = 110;
            $scope.$on('$destroy', function(){
                detectorPromise.then(function(detector) { detector.disconnect(); });
            });
        },
        templateUrl: 'templates/strobeTuner.html',
    };
});
})();

