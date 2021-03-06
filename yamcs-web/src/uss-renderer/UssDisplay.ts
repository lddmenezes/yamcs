import * as utils from './utils';

import { ExternalImage } from './widgets/ExternalImage';
import { Field } from './widgets/Field';
import { Label } from './widgets/Label';
import { LinearTickMeter } from './widgets/LinearTickMeter';
import { LineGraph } from './widgets/LineGraph';
import { NavigationButton } from './widgets/NavigationButton';
import { Polyline } from './widgets/Polyline';
import { Rectangle } from './widgets/Rectangle';
import { Symbol } from './widgets/Symbol';
import { AbstractWidget } from './widgets/AbstractWidget';
import { Svg, Rect, Tag, Defs, Pattern } from './tags';
import { Compound } from './widgets/Compound';
import { Color } from './Color';
import { ResourceResolver } from '../app/monitor/displays/ResourceResolver';
import { DisplayFrame } from '../app/monitor/displays/DisplayFrame';
import { ParameterSample } from './ParameterSample';
import { ParameterValue, Alias } from '../yamcs-client';
import { StyleSet } from './StyleSet';
import { Display } from '../app/monitor/displays/Display';

export class UssDisplay implements Display {

  private widgets: AbstractWidget[] = [];
  private opsNames = new Set<string>();
  private widgetsByTrigger = new Map<string, AbstractWidget[]>();

  bgcolor: Color;
  title: string;
  width: number;
  height: number;

  container: HTMLDivElement;
  measurerSvg: SVGSVGElement;

  styleSet: StyleSet;

  constructor(
    readonly frame: DisplayFrame,
    private targetEl: HTMLDivElement,
    readonly resourceResolver: ResourceResolver,
  ) {
    this.container = document.createElement('div');
    this.container.setAttribute('style', 'position: relative');
    this.targetEl.appendChild(this.container);

    // Invisible SVG used to measure font metrics before drawing
    this.measurerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.measurerSvg.setAttribute('height', '0');
    this.measurerSvg.setAttribute('width', '0');
    this.measurerSvg.setAttribute('style', 'visibility: hidden');
    targetEl.appendChild(this.measurerSvg);
  }

  parseAndDraw(id: string, grid = false) {
    return Promise.all([
      this.resourceResolver.retrieveXMLDisplayResource(id),
      this.resourceResolver.retrieveXML('mcs_dqistyle.xml'),
    ]).then(docs => {
      this.styleSet = new StyleSet(docs[1]);
      const displayEl = docs[0].getElementsByTagName('Display')[0];

      this.title = utils.parseStringChild(displayEl, 'Title', 'Untitled');
      this.width = utils.parseFloatChild(displayEl, 'Width');
      this.height = utils.parseFloatChild(displayEl, 'Height');
      this.bgcolor = utils.parseColorChild(displayEl, 'BackgroundColor', new Color(212, 212, 212, 255));

      const rootEl = new Svg({
        width: this.width,
        height: this.height,
        'xmlns': 'http://www.w3.org/2000/svg',
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      });

      this.addDefinitions(rootEl);
      this.addStyles(rootEl);

      rootEl.addChild(new Rect({
        x: 0,
        y: 0,
        width: this.width,
        height: this.height,
        fill: this.bgcolor
      }));

      if (grid) {
        rootEl.addChild(new Rect({
          x: 0,
          y: 0,
          width: this.width,
          height: this.height,
          style: 'fill: url(#uss-grid)',
        }));
      }

      const elementsNode = utils.findChild(displayEl, 'Elements');
      const elementNodes = utils.findChildren(elementsNode);
      this.drawElements(rootEl, elementNodes);

      const svg = rootEl.toDomElement() as SVGSVGElement;
      this.targetEl.appendChild(svg);

      // Call widget-specific lifecycle hooks
      for (const widget of this.widgets) {
        widget.svg = svg;
        widget.afterDomAttachment();
        widget.initializeBindings();
      }
    });
  }

  public getBackgroundColor() {
    return this.bgcolor.toString();
  }

  private addDefinitions(svg: Svg) {
    const defs = new Defs().addChild(
      new Pattern({
        id: 'uss-grid',
        patternUnits: 'userSpaceOnUse',
        width: 10,
        height: 10,
      }).addChild(
        new Rect({ x: 0, y: 0, width: 2, height: 1, fill: '#c0c0c0' })
      )
    );
    svg.addChild(defs);
  }

  private addStyles(svg: Svg) {
    const style = new Tag('style', {}, `
      text {
        user-select: none;
        -moz-user-select: none;
        -khtml-user-select: none;
        -webkit-user-select: none;
      }
      /*.field:hover {
        opacity: 0.7;
      }*/
    `);
    svg.addChild(style);
  }

  drawElements(parent: Tag, elementNodes: Node[]) {
    for (let i = 0; i < elementNodes.length; i++) {
      const node = elementNodes[i];
      if (node.attributes.getNamedItem('reference')) {
        elementNodes[i] = utils.getReferencedElement(node);
      }
    }

    const widgets = [];
    for (const node of elementNodes) {
      const widget = this.createWidget(node);
      if (widget) {
        widget.tag = widget.parseAndDraw();
        widgets.push(widget);
      }
    }

    // Widgets are added by depth first, and by definition order second.
    widgets.sort((a, b) => {
      const cmp = a.depth - b.depth;
      return cmp || (a.sequenceNumber - b.sequenceNumber);
    });

    for (const widget of widgets) {
      this.addWidget(widget, parent);
    }
  }

  createWidget(node: Node) {
    return this.createWidgetByName(node, node.nodeName);
  }

  private createWidgetByName(node: Node, widgetName: string): AbstractWidget | undefined {
    switch (widgetName) {
      case 'Compound':
        return new Compound(node, this);
      case 'ExternalImage':
        return new ExternalImage(node, this);
      case 'Field':
        return new Field(node, this);
      case 'Label':
        return new Label(node, this);
      case 'LinearTickMeter':
        return new LinearTickMeter(node, this);
      case 'LineGraph':
        return new LineGraph(node, this);
      case 'NavigationButton':
        return new NavigationButton(node, this);
      case 'Polyline':
        return new Polyline(node, this);
      case 'Rectangle':
        return new Rectangle(node, this);
      case 'Symbol':
        return new Symbol(node, this);
      case 'LabelFor':
        const widgetClass = utils.parseStringAttribute(node, 'class');
        return this.createWidgetByName(node, widgetClass);
      default:
        console.warn(`Unsupported widget type: ${widgetName}`);
        return;
    }
  }

  addWidget(widget: AbstractWidget, parent: Tag) {
    parent.addChild(widget.tag);
    this.widgets.push(widget);

    for (const binding of widget.parameterBindings) {
      if (binding.opsName) {
        this.registerWidgetTriggers(binding.opsName, widget);
        this.opsNames.add(binding.opsName);
      }
    }
    for (const binding of widget.computationBindings) {
      for (const arg of binding.args) {
        if (arg.opsName) {
          this.registerWidgetTriggers(arg.opsName, widget);
          this.opsNames.add(arg.opsName);
        }
      }
    }
  }

  private registerWidgetTriggers(opsName: string, widget: AbstractWidget) {
    const widgets = this.widgetsByTrigger.get(opsName);
    if (widgets) {
      widgets.push(widget);
    } else {
      this.widgetsByTrigger.set(opsName, [widget]);
      this.opsNames.add(opsName);
    }
  }

  getParameterIds() {
    const ids: Alias[] = [];
    this.opsNames.forEach(opsName => ids.push({
      namespace: 'MDB:OPS Name',
      name: opsName,
    }));
    return ids;
  }

  getDataSourceState() {
    let green = false;
    let yellow = false;
    let red = false;
    for (const widget of this.widgets) {
      for (const binding of widget.parameterBindings) {
        const sample = binding.sample;
        if (sample) {
          switch (sample.monitoringResult) {
            case 'IN_LIMITS':
              green = true;
              break;
            case 'WATCH':
            case 'WARNING':
            case 'DISTRESS':
              yellow = true;
              break;
            case 'CRITICAL':
            case 'SEVERE':
              red = true;
              break;
          }
        }
      }
    }
    return { green, yellow, red };
  }

  processParameterValues(pvals: ParameterValue[]) {
    for (const pval of pvals) {
      const sample = new ParameterSample(pval);
      const widgets = this.widgetsByTrigger.get(sample.opsName);
      if (widgets) {
        for (const widget of widgets) {
          widget.updateBindings(sample);
          widget.dirty = true;
        }
      }
    }
  }

  digest() {
    for (const widget of this.widgets) {
      if (widget.dirty) {
        widget.digest();
        widget.dirty = false;
      }
    }
  }
}
