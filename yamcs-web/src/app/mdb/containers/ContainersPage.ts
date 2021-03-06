import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs/Observable';

import { Container, Instance } from '../../../yamcs-client';

import { YamcsService } from '../../core/services/YamcsService';
import { selectCurrentInstance } from '../../core/store/instance.selectors';
import { Store } from '@ngrx/store';
import { State } from '../../app.reducers';

@Component({
  templateUrl: './ContainersPage.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContainersPage {

  instance$: Observable<Instance>;
  containers$: Observable<Container[]>;

  constructor(yamcs: YamcsService, store: Store<State>) {
    this.instance$ = store.select(selectCurrentInstance);
    this.containers$ = yamcs.getSelectedInstance().getContainers();
  }
}
