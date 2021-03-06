import * as utils from '../utils';

import { AbstractWidget } from './AbstractWidget';
import { G, Rect } from '../tags';
import { Color } from '../Color';
import { Label } from './Label';
import { DataSourceBinding } from '../DataSourceBinding';

interface OpenDisplayCommandOptions {
  target: string;
  openInNewWindow: boolean;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class NavigationButton extends AbstractWidget {

  brightStroke: Color;
  darkStroke: Color;

  commandClass: string;
  openDisplayCommandOptions: OpenDisplayCommandOptions;

  fillColorBinding: DataSourceBinding;

  bgEl: Element;
  shadeEl: Element;

  parseAndDraw() {
    const pressCmd = utils.findChild(this.node, 'PressCommand');
    this.commandClass = utils.parseStringAttribute(pressCmd, 'class');
    switch (this.commandClass) {
      case 'OpenDisplayCommand':
        const relto = this.display.frame.id;
        const base = relto.substring(0, relto.lastIndexOf('/'));
        this.openDisplayCommandOptions = {
          target: `${base}/${utils.parseStringChild(pressCmd, 'DisplayBasename')}.uss`,
          openInNewWindow: utils.parseBooleanChild(pressCmd, 'OpenInNewWindow'),
        };
        if (utils.hasChild(pressCmd, 'Coordinates')) {
          const coordinatesNode = utils.findChild(pressCmd, 'Coordinates');
          this.openDisplayCommandOptions.coordinates = {
            x: utils.parseIntChild(coordinatesNode, 'X'),
            y: utils.parseIntChild(coordinatesNode, 'Y'),
            width: utils.parseIntChild(coordinatesNode, 'Width'),
            height: utils.parseIntChild(coordinatesNode, 'Height'),
          };
        }
        break;
      case 'CloseDisplayCommand':
        break;
      default:
        console.error(`Unsupported command class ${this.commandClass}`);
    }

    const fillStyleNode = utils.findChild(this.node, 'FillStyle');
    const fillColor = utils.parseColorChild(fillStyleNode, 'Color');

    const strokeWidth = 3;
    const boxWidth = this.width - strokeWidth;
    const boxHeight = this.height - strokeWidth;

    this.brightStroke = fillColor.brighter().brighter();
    this.darkStroke = fillColor.darker();

    const g = new G({
      id: this.id,
      cursor: 'pointer',
      class: 'navigation-button',
      'data-name': this.name,
    }).addChild(
      new Rect({
        'data-control': true,
        ...utils.parseFillStyle(this.node),
        stroke: this.brightStroke,
        'stroke-width': strokeWidth,
        'stroke-opacity': 1,
        'shape-rendering': 'crispEdges',
      }).withBorderBox(this.x, this.y, this.width, this.height),
      // Cheap shade effect
      new Rect({
        'data-control': true,
        fill: 'transparent',
        'shape-rendering': 'crispEdges',
        stroke: this.darkStroke,
        'stroke-width': strokeWidth,
        'stroke-opacity': 1,
        'stroke-dasharray': `0,${boxWidth},${boxWidth + boxHeight},${boxHeight}`,
      }).withBorderBox(this.x, this.y, this.width, this.height),
    );

    const releasedCompoundNode = utils.findChild(this.node, 'ReleasedCompound');
    const elementsNode = utils.findChild(releasedCompoundNode, 'Elements');
    const labelNode = utils.findChild(elementsNode, 'Label');

    const labelWidget = new Label(labelNode, this.display);
    labelWidget.tag = labelWidget.parseAndDraw();
    this.display.addWidget(labelWidget, g);

    return g;
  }

  afterDomAttachment() {
    const buttonEl = this.svg.getElementById(this.id);
    this.bgEl = buttonEl.children[0];
    this.shadeEl = buttonEl.children[1];
    buttonEl.addEventListener('mousedown', () => {
      this.bgEl.setAttribute('stroke', this.darkStroke.toString());
      this.shadeEl.setAttribute('stroke', this.brightStroke.toString());
    });
    buttonEl.addEventListener('mouseup', () => {
      this.bgEl.setAttribute('stroke', this.brightStroke.toString());
      this.shadeEl.setAttribute('stroke', this.darkStroke.toString());
    });
    buttonEl.addEventListener('mouseout', () => {
      this.bgEl.setAttribute('stroke', this.brightStroke.toString());
      this.shadeEl.setAttribute('stroke', this.darkStroke.toString());
    });
    buttonEl.addEventListener('click', evt => {
      switch (this.commandClass) {
        case 'OpenDisplayCommand':
          this.executeOpenDisplayCommand();
          break;
        case 'CloseDisplayCommand':
          this.executeCloseDisplayCommand();
          break;
        default:
          throw new Error(`Unsupported command class ${this.commandClass}`);
      }
    });
  }

  private executeOpenDisplayCommand() {
    const frame = this.display.frame;
    if (frame) {
      const opts = this.openDisplayCommandOptions;
      const alreadyOpenFrame = frame.layout.getDisplayFrame(opts.target);
      if (alreadyOpenFrame) {
        frame.layout.bringToFront(alreadyOpenFrame);
      } else {
        if (!opts.openInNewWindow) {
          frame.layout.closeDisplayFrame(frame);
        }
        frame.layout.createDisplayFrame(opts.target, opts.coordinates);
      }
    }
  }

  private executeCloseDisplayCommand() {
    const frame = this.display.frame;
    if (frame) {
      const layout = frame.layout;
      layout.closeDisplayFrame(frame);
    }
  }

  registerBinding(binding: DataSourceBinding) {
    switch (binding.dynamicProperty) {
      case 'FILL_COLOR':
        this.fillColorBinding = binding;
        break;
      default:
        console.warn('Unsupported dynamic property: ' + binding.dynamicProperty);
    }
  }

  digest() {
    if (this.fillColorBinding && this.fillColorBinding.sample) {
      const newColor = Color.forName(this.fillColorBinding.value);
      this.brightStroke = newColor.brighter().brighter();
      this.darkStroke = newColor.darker();

      this.bgEl.setAttribute('fill', newColor.toString());
      this.bgEl.setAttribute('stroke', this.brightStroke.toString());
      this.shadeEl.setAttribute('stroke', this.darkStroke.toString());
    }
  }
}
