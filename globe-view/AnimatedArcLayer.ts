// Based on deck.gl website example: Globe View https://github.com/visgl/deck.gl/blob/8.9-release/examples/website/globe/animated-arc-layer.js

import {ArcLayer} from '@deck.gl/layers';

export default class AnimatedArcLayer extends ArcLayer {
  getShaders() {
    const shaders = super.getShaders();
    shaders.inject = {
      'vs:#decl': `\
          uniform vec2 timeRange;
          in float instanceSourceTimestamp;
          in float instanceTargetTimestamp;
          out float vTimestamp;
        `,
      'vs:#main-end': `\
           vTimestamp = mix(instanceSourceTimestamp, instanceTargetTimestamp, segmentRatio);
        `,
      'fs:#decl': `\
          uniform vec2 timeRange;
          in float vTimestamp;
        `,
      'fs:#main-start': `\
          if (vTimestamp < timeRange.x || vTimestamp > timeRange.y) {
            discard;
          }
        `,
      'fs:DECKGL_FILTER_COLOR': `\
          color.a *= (vTimestamp - timeRange.x) / (timeRange.y - timeRange.x);`
    };
    return shaders;
  }

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceSourceTimestamp: {
        size: 1,
        accessor: 'getSourceTimestamp'
      },
      instanceTargetTimestamp: {
        size: 1,
        accessor: 'getTargetTimestamp'
      }
    });
  }

  draw(params) {
    params.uniforms = Object.assign({}, params.uniforms, {
      timeRange: this.props.timeRange
    });
    super.draw(params);
  }
}
