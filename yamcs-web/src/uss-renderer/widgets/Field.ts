import * as utils from '../utils';

const sprintf = require('sprintf-js').sprintf;


import { AbstractWidget } from './AbstractWidget';
import { G, Rect, Text } from '../tags';
import { Color } from '../Color';
import { DataSourceBinding } from '../DataSourceBinding';
import { DEFAULT_STYLE } from '../StyleSet';
import { DataSourceSample } from '../DataSourceSample';

const indicatorChars = 2;

/**
 * Converts the monitoring result from Yamcs to CDMCS.
 */
export function convertMonitoringResult(sample: DataSourceSample) {
  switch (sample.monitoringResult) {
    case 'DISABLED':
      return 'DISABLED';
    case 'IN_LIMITS':
      return 'IN_LIMITS';
    case 'WATCH':
    case 'WARNING':
    case 'DISTRESS':
      if (sample.rangeCondition === 'LOW') {
        return 'NOMINAL_LOW_LIMIT_VIOLATION';
      } else if (sample.rangeCondition === 'HIGH') {
        return 'NOMINAL_HIGH_LIMIT_VIOLATION';
      } else {
        return 'NOMINAL_LIMIT_VIOLATION';
      }
    case 'CRITICAL':
    case 'SEVERE':
      if (sample.rangeCondition === 'LOW') {
        return 'DANGER_LOW_LIMIT_VIOLATION';
      } else if (sample.rangeCondition === 'HIGH') {
        return 'DANGER_HIGH_LIMIT_VIOLATION';
      } else {
        // Does not exist??
        // return 'DANGER_LIMIT_VIOLATION'
        return 'DANGER_HIGH_LIMIT_VIOLATION';
      }
    default:
      return 'UNDEFINED';
  }
}

export class Field extends AbstractWidget {

  decimals: number;
  format: string | null;
  overrideDqi: boolean;
  showIndicators: boolean;
  colSize: number;

  private xBinding: DataSourceBinding;
  private yBinding: DataSourceBinding;
  private valueBinding: DataSourceBinding;
  private fillColorBinding: DataSourceBinding;

  private fieldEl: Element;
  private fieldBackgroundEl: Element;
  private fieldIndicatorEl: Element;
  private fieldTextEl: Element;

  parseAndDraw() {
    const g = new G({
      id: `${this.id}-group`,
      transform: `translate(${this.x},${this.y})`,
      class: 'field',
      'data-name': this.name,
    });

    this.decimals = utils.parseIntChild(this.node, 'Decimals', 0);
    if (utils.hasChild(this.node, 'Format')) {
      this.format = utils.parseStringChild(this.node, 'Format');
    }
    this.overrideDqi = utils.parseBooleanChild(this.node, 'OverrideDQI', false);
    this.showIndicators = utils.parseBooleanChild(this.node, 'ShowIndicators');

    const columns = utils.parseIntChild(this.node, 'Columns');
    let effectiveColumns = columns;
    if (this.showIndicators) {
      effectiveColumns += indicatorChars;
    }

    const textStyleNode = utils.findChild(this.node, 'TextStyle');
    const textStyle = utils.parseTextStyle(textStyleNode);
    const fontFamily = textStyle['font-family'];
    const fontSize = textStyle['font-size'];
    const fm = this.getFontMetrics('w', fontFamily, fontSize);

    this.colSize = Math.floor(fm.width);

    // FIXME In firefox the colSize is not correctly calculated
    // So force to 6 based on the most common font style.
    if (this.colSize === 8 && fontFamily === 'Lucida Sans Typewriter') {
      this.colSize = 6;
    }

    if (utils.hasChild(this.node, 'Unit') && utils.parseBooleanChild(this.node, 'ShowUnit')) {
      const unit = utils.parseStringChild(this.node, 'Unit');
      const unitTextStyleNode = utils.findChild(this.node, 'UnitTextStyle');
      const unitTextStyle = utils.parseTextStyle(unitTextStyleNode);
      const unitFontFamily = unitTextStyle['font-family'];
      const unitFontSize = unitTextStyle['font-size'];
      const unitFm = this.getFontMetrics('w', unitFontFamily, unitFontSize);

      const unitVertAlignment = utils.parseStringChild(unitTextStyleNode, 'VerticalAlignment');
      let unitY;
      if (unitVertAlignment === 'CENTER') {
        unitY = Math.ceil(this.height / 2);
      } else if (unitVertAlignment === 'TOP') {
        unitY = Math.ceil(unitFm.height / 2);
      } else if (unitVertAlignment === 'BOTTOM') {
        unitY = Math.ceil(this.height - (unitFm.height / 2));
      }

      g.addChild(new Text({
        x: (effectiveColumns * this.colSize) + 2,
        y: unitY,
        ...unitTextStyle,
        'dominant-baseline': 'middle',
        'text-anchor': 'start',
      }, unit));
    }

    const boxWidth = effectiveColumns * this.colSize;
    const rect = new Rect({
      id: `${this.id}-bg`,
      x: 0,
      y: 0,
      width: boxWidth,
      height: this.height,
      ...utils.parseFillStyle(this.node),
      'shape-rendering': 'crispEdges',
    });

    if (!this.overrideDqi) {
      rect.setAttribute('fill', this.styleSet.getStyle('NOT_RECEIVED').bg.toString());
      rect.setAttribute('fill-opacity', '1');
    }

    const rectParent = g;
    /*for (const binding of this.parameterBindings) {
      if (binding.dynamicProperty === 'VALUE' && binding.opsName) {
        const yamcsInstance = 'dev'; // TODO window.location.pathname.match(/\/([^\/]*)\/?/)[1];
        const a = new Tag('a', {
          cursor: 'pointer',
          'xlink:href': `/${yamcsInstance}/mdb/MDB:OPS Name/${binding.opsName}`,
        });
        g.addChild(a);
        rectParent = a;
        break;
      }
    }*/
    rectParent.addChild(rect);

    let textWidth = boxWidth;
    if (this.showIndicators) {
      textWidth -= indicatorChars * this.colSize;
    }

    const text = new Text({
      id: this.id,
      y: 0,
      ...textStyle,
      'pointer-events': 'none',
    });

    const overflowBehavior = utils.parseStringChild(this.node, 'OverflowBehavior');
    if (overflowBehavior !== 'OVERWRITE') {
      console.warn('Unsupported overflow behavior ' + overflowBehavior);
    }

    g.addChild(text);

    let x;
    const horizAlignment = utils.parseStringChild(textStyleNode, 'HorizontalAlignment');
    if (horizAlignment === 'CENTER') {
      x = 0 + textWidth / 2;
      text.setAttribute('text-anchor', 'middle');
    } else if (horizAlignment === 'LEFT') {
      x = 0;
      text.setAttribute('text-anchor', 'start');
    } else if (horizAlignment === 'RIGHT') {
      x = 0 + textWidth;
      text.setAttribute('text-anchor', 'end');
    }
    text.setAttribute('x', String(x));

    let y;
    const vertAlignment = utils.parseStringChild(textStyleNode, 'VerticalAlignment');
    if (vertAlignment === 'CENTER') {
      y = Math.ceil(this.height / 2);
    } else if (vertAlignment === 'TOP') {
      y = Math.ceil(fm.height / 2);
    } else if (vertAlignment === 'BOTTOM') {
      y = Math.ceil(this.height - (fm.height / 2));
    }

    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('y', String(y));

    if (this.showIndicators) {
      const indicatorText = new Text({
        id: `${this.id}-ind`,
        x: boxWidth,
        y: Math.ceil(this.height / 2),
        fill: textStyle['fill'],
        'font-size': textStyle['font-size'],
        'font-family': textStyle['font-family'],
        'dominant-baseline': 'middle',
        'text-anchor': 'end',
        'pointer-events': 'none',
      });
      g.addChild(indicatorText);
    }

    return g;
  }

  afterDomAttachment() {
    this.fieldEl = this.svg.getElementById(`${this.id}-group`);
    this.fieldBackgroundEl = this.svg.getElementById(`${this.id}-bg`);
    this.fieldIndicatorEl = this.svg.getElementById(`${this.id}-ind`);
    this.fieldTextEl = this.svg.getElementById(this.id);
  }

  registerBinding(binding: DataSourceBinding) {
    switch (binding.dynamicProperty) {
      case 'VALUE':
        this.valueBinding = binding;
        break;
      case 'X':
        this.xBinding = binding;
        break;
      case 'Y':
        this.yBinding = binding;
        break;
      case 'FILL_COLOR':
        this.fillColorBinding = binding;
        break;
      default:
        console.warn('Unsupported dynamic property: ' + binding.dynamicProperty);
    }
  }

  digest() {
    if (this.valueBinding && this.valueBinding.sample) {
      const sample = this.valueBinding.sample;
      const cdmcsMonitoringResult = convertMonitoringResult(sample);
      let v = this.valueBinding.value;
      if (typeof v === 'number') {
        if (this.format) {
          v = sprintf(this.format, v);
        } else {
          v = v.toFixed(this.decimals);
        }
      }
      this.fieldTextEl.textContent = v;
      let style = DEFAULT_STYLE;
      switch (sample.acquisitionStatus) {
        case 'ACQUIRED':
          style = this.styleSet.getStyle('ACQUIRED', cdmcsMonitoringResult);
          break;
        case 'NOT_RECEIVED':
          style = this.styleSet.getStyle('NOT_RECEIVED');
          break;
        case 'INVALID':
          style = this.styleSet.getStyle('INVALID');
          break;
        case 'EXPIRED':
          style = this.styleSet.getStyle('STATIC', cdmcsMonitoringResult);
          break;
      }

      if (!this.overrideDqi) {
        this.fieldBackgroundEl.setAttribute('fill', style.bg.toString());
        this.fieldTextEl.setAttribute('fill', style.fg.toString());
        if (this.showIndicators) {
          this.fieldIndicatorEl.setAttribute('fill', style.fg.toString());
        }
      }

      if (this.showIndicators) {
        const flags = style.flags;
        this.fieldIndicatorEl.textContent = flags.replace(' ', '\u00a0');
      }
    }
    if (this.xBinding && this.xBinding.sample) {
      this.x = this.xBinding.value;
    }
    if (this.yBinding && this.yBinding.sample) {
      this.y = this.yBinding.value;
    }
    this.fieldEl.setAttribute('transform', `translate(${this.x},${this.y})`);

    if (this.fillColorBinding && this.fillColorBinding.sample && this.overrideDqi) {
      const value = this.fillColorBinding.value;
      const color = Color.forName(value);
      this.fieldBackgroundEl.setAttribute('fill', color.toString());
    }
  }
}
