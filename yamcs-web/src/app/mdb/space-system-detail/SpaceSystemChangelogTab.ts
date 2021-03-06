import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs/Observable';

import { Instance, SpaceSystem } from '../../../yamcs-client';

import { ActivatedRoute } from '@angular/router';

import { YamcsService } from '../../core/services/YamcsService';

@Component({
  templateUrl: './SpaceSystemChangelogTab.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpaceSystemChangelogTab {

  qualifiedName: string;

  instance$: Observable<Instance>;
  spaceSystem$: Observable<SpaceSystem>;

  constructor(route: ActivatedRoute, yamcs: YamcsService) {
    const parent = route.snapshot.parent!;
    this.qualifiedName = parent.paramMap.get('qualifiedName')!;
    this.spaceSystem$ = yamcs.getSelectedInstance().getSpaceSystem(this.qualifiedName);
  }
}
