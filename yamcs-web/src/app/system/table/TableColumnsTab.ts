import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs/Observable';

import { Table } from '../../../yamcs-client';

import { ActivatedRoute } from '@angular/router';

import { YamcsService } from '../../core/services/YamcsService';

@Component({
  templateUrl: './TableColumnsTab.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableColumnsTab {

  table$: Observable<Table>;

  constructor(route: ActivatedRoute, yamcs: YamcsService) {
    const parent = route.snapshot.parent;
    if (parent) {
      const name = parent.paramMap.get('name');
      if (name) {
        this.table$ = yamcs.getSelectedInstance().getTable(name);
      }
    }
  }
}
