//
//  CapacitorBridge.swift
//  App
//
//  Created by Chris on 4/25/26.
//

import UIKit
import Capacitor

@objc class CapacitorBridge: NSObject {
    static func configure(webView: UIView) {
        if #available(iOS 11.0, *) {
            webView.insetsLayoutMarginsFromSafeArea = false
        }
    }
}
