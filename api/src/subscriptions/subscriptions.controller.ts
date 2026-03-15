import { Body, Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('activate-trial')
  activateTrial(@Request() req, @Body('deviceId') deviceId?: string) {
    return this.subscriptionsService.activateTrial(req.user.userId, deviceId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('request-premium')
  requestPremium(@Request() req) {
    return this.subscriptionsService.requestPremium(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('mine')
  getMySubscription(@Request() req) {
    return this.subscriptionsService.getMySubscription(req.user.userId);
  }
}
