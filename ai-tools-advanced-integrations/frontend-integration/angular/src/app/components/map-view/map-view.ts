import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';
import { DeckMapService, ViewState } from '../../services/deck-map.service';
import { MapInstances } from '../../models/message.model';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [],
  templateUrl: './map-view.html',
  styleUrl: './map-view.css',
})
export class MapView implements OnInit, OnDestroy {
  @Output() mapInit = new EventEmitter<MapInstances>();
  @Output() viewStateChange = new EventEmitter<ViewState>();

  private viewStateSubscription?: Subscription;

  constructor(private deckMapService: DeckMapService) {}

  async ngOnInit(): Promise<void> {
    // Subscribe to view state changes
    this.viewStateSubscription = this.deckMapService.viewStateChange$.subscribe((viewState) => {
      this.viewStateChange.emit(viewState);
    });

    const { deck, map } = await this.deckMapService.initialize(
      'map-container',
      'map-container-canvas'
    );
    this.mapInit.emit({ deck, map });
  }

  ngOnDestroy(): void {
    this.viewStateSubscription?.unsubscribe();
    this.deckMapService.destroy();
  }
}
